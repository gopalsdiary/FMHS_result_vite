import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

interface StudentRow extends Record<string, unknown> {
  iid: string
  class: string | null
  section: string | null
  roll: number | null
  total_mark: number | null
  average_mark: number | null
  count_absent: string | null
  // db snapshot for change detection
  _db_total: number | null
  _db_avg: number | null
  _db_absent: string | null
}

function parseNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function TotalAveragePage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<StudentRow[]>([])
  const [subjectCols, setSubjectCols] = useState<string[]>([]) // *Subject_Total column names
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({})
  const [rowSaved, setRowSaved] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) navigate('/login', { replace: true })
    })
  }, [navigate])

  // Detect subject Total columns from first row
  async function detectSubjectCols(): Promise<string[]> {
    const { data } = await supabase.from('fmhs_exam_data').select('*').limit(1)
    if (!data?.length) return []
    const keys = Object.keys(data[0])
    return keys.filter(k => /\*?.+_Total$/i.test(k))
  }

  const loadAll = useCallback(async () => {
    setLoading(true); setStatus('Loading all students…')
    const cols = await detectSubjectCols()
    setSubjectCols(cols)

    const selectCols = [
      'iid', 'class', 'section', 'roll',
      'total_mark', 'average_mark', 'count_absent',
      ...cols.map(c => `"${c}"`)
    ].join(', ')

    const { data, error } = await supabase
      .from('fmhs_exam_data')
      .select(selectCols)
      .order('class', { ascending: true })
      .order('section', { ascending: true })
      .order('roll', { ascending: true })

    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }

    const rows = (data ?? []).map(r => {
      const row = r as unknown as Record<string, unknown>
      return {
        ...row,
        _db_total: row.total_mark as number | null,
        _db_avg: row.average_mark as number | null,
        _db_absent: row.count_absent as string | null,
      }
    }) as StudentRow[]

    setStudents(rows)
    setStatus(`Loaded ${rows.length} students`)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // Calculate totals in memory for all rows
  function calcAll(rows: StudentRow[], cols: string[]): StudentRow[] {
    return rows.map(student => {
      let total = 0, valid = 0
      cols.forEach(col => {
        const m = parseNum(student[col])
        if (m > 0) { total += m; valid++ }
      })
      const avg = valid > 0 ? Math.round(total / valid) : 0
      const absent = Math.max(0, 9 - valid)
      return {
        ...student,
        total_mark: total > 0 ? total : null,
        average_mark: avg > 0 ? avg : null,
        count_absent: absent > 0 ? String(absent) : null,
      }
    })
  }

  function handleCalculate() {
    setCalculating(true)
    setStatus('Calculating totals for all students…')
    const updated = calcAll(students, subjectCols)
    setStudents(updated)
    setStatus(`Calculated ${updated.length} students — click "Update Database" to save`)
    setCalculating(false)
  }

  async function handleUpdateAll() {
    if (!window.confirm(`Update ${students.length} records to database?`)) return
    setSaving(true); setStatus('Saving to database…')
    const updates = students.map(s => ({
      iid: s.iid,
      total_mark: s.total_mark ?? null,
      average_mark: s.average_mark ?? null,
      count_absent: s.count_absent ?? null,
    }))
    const { error } = await supabase.from('fmhs_exam_data').upsert(updates, { onConflict: 'iid' })
    if (!error) {
      setStudents(prev => prev.map(s => ({ ...s, _db_total: s.total_mark, _db_avg: s.average_mark, _db_absent: s.count_absent })))
      setStatus(`✅ Saved ${students.length} records to database`)
    } else {
      setStatus('Error: ' + error.message)
    }
    setSaving(false)
  }

  async function saveRow(iid: string) {
    const s = students.find(r => r.iid === iid)
    if (!s) return
    setRowSaving(prev => ({ ...prev, [iid]: true }))
    const { error } = await supabase
      .from('fmhs_exam_data')
      .update({
        total_mark: s.total_mark ?? null,
        average_mark: s.average_mark ?? null,
        count_absent: s.count_absent ?? null,
      })
      .eq('iid', iid)
    if (!error) {
      setStudents(prev => prev.map(r => r.iid === iid ? { ...r, _db_total: r.total_mark, _db_avg: r.average_mark, _db_absent: r.count_absent } : r))
      setRowSaved(prev => ({ ...prev, [iid]: true }))
      setTimeout(() => setRowSaved(prev => ({ ...prev, [iid]: false })), 2000)
    }
    setRowSaving(prev => ({ ...prev, [iid]: false }))
  }

  function isDirty(s: StudentRow) {
    return s.total_mark !== s._db_total || s.average_mark !== s._db_avg || s.count_absent !== s._db_absent
  }

  const thStyle: React.CSSProperties = {
    writingMode: 'vertical-rl',
    textOrientation: 'mixed',
    verticalAlign: 'bottom',
    height: '110px',
    minWidth: '44px',
    padding: '6px 4px',
    fontSize: '11px',
    background: '#f0f3f6',
    border: '1px solid #d0d7de',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  }
  const thHoriz: React.CSSProperties = {
    padding: '6px 8px',
    fontSize: '12px',
    background: '#f0f3f6',
    border: '1px solid #d0d7de',
    textAlign: 'center',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  }

  return (
    <PageShell title="Part 2 – Total & Average">
      {() => (
        <div>
          {/* Toolbar */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={loadAll} disabled={loading}>
                {loading ? 'Loading…' : '📊 Refresh Data'}
              </button>
              <button className="btn btn-success" onClick={handleCalculate} disabled={calculating || students.length === 0}>
                {calculating ? 'Calculating…' : '🔄 Calculate All Totals'}
              </button>
              <button
                className="btn"
                style={{ background: '#ff8a00', borderColor: '#ff8a00', color: '#fff' }}
                onClick={handleUpdateAll}
                disabled={saving || students.length === 0}
              >
                {saving ? 'Saving…' : '💾 Update Database'}
              </button>
              <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#555' }}>{status}</span>
            </div>
          </div>

          {loading && <div className="spinner" />}

          {!loading && students.length > 0 && (
            <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #d0d7de', borderRadius: '6px' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '13px', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={thHoriz}>IID</th>
                    <th style={thHoriz}>Class</th>
                    <th style={thHoriz}>Section</th>
                    <th style={thHoriz}>Roll</th>
                    <th style={{ ...thHoriz, background: '#e7f3ff' }}>Total Marks</th>
                    <th style={{ ...thHoriz, background: '#e7f3ff' }}>Average</th>
                    <th style={{ ...thHoriz, background: '#e7f3ff' }}>Count Absent</th>
                    <th style={thHoriz}>Action</th>
                    {subjectCols.map(col => (
                      <th key={col} style={thStyle}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => {
                    const dirty = isDirty(s)
                    return (
                      <tr key={s.iid} style={{ background: i % 2 === 0 ? '#fff' : '#fcfcfd' }}>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{s.iid}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{s.class ?? '—'}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{s.section ?? '—'}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{s.roll ?? '—'}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 600, background: '#f0f9ff' }}>{s.total_mark ?? ''}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 600, background: '#f0f9ff' }}>{s.average_mark ?? ''}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 600, background: '#f0f9ff' }}>{s.count_absent ?? ''}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>
                          <button
                            onClick={() => saveRow(s.iid)}
                            disabled={rowSaving[s.iid]}
                            style={{
                              fontSize: '11px', padding: '3px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                              background: rowSaved[s.iid] ? '#1a7f37' : dirty ? '#ff8a00' : '#0366d6',
                              color: '#fff', fontWeight: 500,
                            }}
                          >
                            {rowSaved[s.iid] ? '✅ Saved' : rowSaving[s.iid] ? '…' : 'Update'}
                          </button>
                        </td>
                        {subjectCols.map(col => (
                          <td key={col} style={{ padding: '5px 4px', border: '1px solid #d0d7de', textAlign: 'center' }}>
                            {parseNum(s[col]) > 0 ? String(s[col]) : ''}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && students.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: '#6a737d', padding: '40px' }}>No data loaded</div>
          )}
        </div>
      )}
    </PageShell>
  )
}

