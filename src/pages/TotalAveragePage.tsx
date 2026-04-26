import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'
import {
  buildClassSubjectFlags,
  buildSubjectLookup,
  fetchAllRows,
  loadExamSubjectContext,
  loadOptionalSubjectMapForExam,
  normalizeSubjectValue,
  resolveSubjectRule,
  subjectMatchesOptional,
} from '@/services/examResultContext'

interface StudentRow extends Record<string, unknown> {
  id: number
  exam_id: number | null
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

interface ClassSubjectInfo {
  subject_code: string
  class: number
  is_fourth_subject: boolean
  exclude_from_rank: boolean
}

export default function TotalAveragePage() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const parsedExamId = examId ? Number(examId) : null
  const activeExamId = examId && Number.isFinite(parsedExamId ?? NaN) ? parsedExamId : null
  const [students, setStudents] = useState<StudentRow[]>([])
  const [subjectCols, setSubjectCols] = useState<string[]>([]) // *Subject_Total column names
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rowSaving, setRowSaving] = useState<Record<number, boolean>>({})
  const [rowSaved, setRowSaved] = useState<Record<number, boolean>>({})
  const [status, setStatus] = useState('')
  const [classSubjectInfo, setClassSubjectInfo] = useState<ClassSubjectInfo[]>([])
  const [subjectRules, setSubjectRules] = useState<any[]>([])
  const [optionalSubjectMap, setOptionalSubjectMap] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) navigate('/login', { replace: true })
    })
  }, [navigate])

  // Detect subject Total columns from first row
  async function detectSubjectCols(examFilter: number | null): Promise<string[]> {
    let query = supabase.from('fmhs_exam_data').select('*').limit(1)
    if (examFilter !== null) {
      query = query.eq('exam_id', examFilter)
    }

    const { data } = await query
    if (!data?.length) return []
    const keys = Object.keys(data[0])
    return keys.filter(k => /\*?.+_Total$/i.test(k))
  }

  const loadAll = useCallback(async () => {
    if (examId && activeExamId === null) {
      setLoading(false)
      setStatus(`Invalid exam id in URL: ${examId}`)
      return
    }

    setLoading(true); setStatus(activeExamId !== null ? `Loading students for exam ${activeExamId}…` : 'Loading all students…')
    const cols = await detectSubjectCols(activeExamId)
    setSubjectCols(cols)

    // Load class-subject assignments and subject rules
    if (activeExamId !== null) {
      const { rules, classAssignments } = await loadExamSubjectContext(activeExamId)
      setSubjectRules(rules || [])
      setClassSubjectInfo(classAssignments)
      setOptionalSubjectMap(await loadOptionalSubjectMapForExam(activeExamId))
    } else {
      setSubjectRules([])
      setClassSubjectInfo([])
      setOptionalSubjectMap({})
    }

    const selectCols = [
      'id', 'exam_id', 'iid', 'class', 'section', 'roll',
      'total_mark', 'average_mark', 'count_absent',
      ...cols.map(c => `"${c}"`)
    ].join(', ')

    const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
      let query = supabase.from('fmhs_exam_data').select(selectCols)
      if (activeExamId !== null) {
        query = query.eq('exam_id', activeExamId)
      }
      return query
        .order('class', { ascending: true })
        .order('section', { ascending: true })
        .order('roll', { ascending: true })
        .range(from, to)
    })

    const mappedRows = rows.map(r => {
      const row = r as unknown as Record<string, unknown>
      return {
        ...row,
        id: Number(row.id),
        exam_id: row.exam_id as number | null,
        iid: String(row.iid ?? ''),
        _db_total: row.total_mark as number | null,
        _db_avg: row.average_mark as number | null,
        _db_absent: row.count_absent as string | null,
      }
    }) as StudentRow[]

    setStudents(mappedRows)
    setStatus(activeExamId !== null ? `Loaded ${mappedRows.length} students for exam ${activeExamId}` : `Loaded ${mappedRows.length} students`)
    setLoading(false)
  }, [activeExamId, examId])

  useEffect(() => { loadAll() }, [loadAll])

  // Calculate totals in memory for all rows — class-aware
  function calcAll(rows: StudentRow[], cols: string[]): StudentRow[] {
    const subjectLookup = buildSubjectLookup(subjectRules as any[])
    const classFlagsByClass = buildClassSubjectFlags(classSubjectInfo)

    return rows.map(student => {
      const studentClass = Number(student.class) || 0
      const classAssignments = classFlagsByClass[studentClass] ?? {
        subjectCodes: new Set<string>(),
        fourthSubjectCodes: new Set<string>(),
        excludeFromRankCodes: new Set<string>(),
      }
      const hasAssignments = classAssignments.subjectCodes.size > 0
      const hasRuleData = subjectRules.length > 0
      const studentOptionalSubject = optionalSubjectMap[String(student.iid ?? '')] || ''

      let total = 0, valid = 0
      let attendedSubjects = 0 // excludes 4th subject for absent count
      let expectedMainSubjects = 0 // expected subjects for this student/class

      cols.forEach(col => {
        // Extract subject name from column like "*Bangla 1st Paper_Total"
        const subjectCleanName = col.replace(/^\*+\s*/, '').replace(/_Total$/i, '').trim()
        const subjectRule = hasRuleData ? resolveSubjectRule(subjectLookup, subjectCleanName) : undefined
        if (hasRuleData && !subjectRule) return
        const subjectCode = normalizeSubjectValue(subjectRule?.subject_code ?? subjectCleanName)

        // If class assignments exist, skip subjects not assigned to this class
        if (hasAssignments && !classAssignments.subjectCodes.has(subjectCode)) return

        const isFourthSubject = classAssignments.fourthSubjectCodes.has(subjectCode)
        const isExcluded = classAssignments.excludeFromRankCodes.has(subjectCode)
        const isStudentFourthSubject = isFourthSubject && subjectMatchesOptional(studentOptionalSubject, subjectRule)
        if (!isExcluded && !isStudentFourthSubject) {
          expectedMainSubjects++
        }
        const m = parseNum(student[col])
        if (m > 0) {
          if (!isExcluded) {
            total += m
            valid++
          }
          if (!isStudentFourthSubject && !isExcluded) {
            attendedSubjects++
          }
        }
      })

      // Calculate expected subject count for this class
      const totalSubjectCount = hasAssignments ? expectedMainSubjects : cols.length

      const avg = valid > 0 ? Math.round(total / valid) : 0
      const absent = Math.max(0, totalSubjectCount - attendedSubjects)
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
    setStatus(activeExamId !== null ? `Calculating totals for exam ${activeExamId}…` : 'Calculating totals for all students…')
    const updated = calcAll(students, subjectCols)
    setStudents(updated)
    setStatus(activeExamId !== null
      ? `Calculated ${updated.length} students for exam ${activeExamId} — click "Update Database" to save`
      : `Calculated ${updated.length} students — click "Update Database" to save`)
    setCalculating(false)
  }

  async function handleUpdateAll() {
    if (!window.confirm(`Update ${students.length} records to database?`)) return
    setSaving(true); setStatus('Saving to database…')
    const updates = students.map(s => ({
      id: s.id,
      exam_id: s.exam_id ?? activeExamId,
      iid: s.iid,
      total_mark: s.total_mark ?? null,
      average_mark: s.average_mark ?? null,
      count_absent: s.count_absent ?? null,
    }))
    const { error } = await supabase.from('fmhs_exam_data').upsert(updates, { onConflict: 'id' })
    if (!error) {
      setStudents(prev => prev.map(s => ({ ...s, _db_total: s.total_mark, _db_avg: s.average_mark, _db_absent: s.count_absent })))
      setStatus(`✅ Saved ${students.length} records to database`)
    } else {
      setStatus('Error: ' + error.message)
    }
    setSaving(false)
  }

  async function saveRow(rowId: number) {
    const s = students.find(r => r.id === rowId)
    if (!s) return
    setRowSaving(prev => ({ ...prev, [rowId]: true }))
    const { error } = await supabase
      .from('fmhs_exam_data')
      .update({
        total_mark: s.total_mark ?? null,
        average_mark: s.average_mark ?? null,
        count_absent: s.count_absent ?? null,
      })
      .eq('id', s.id)
    if (!error) {
      setStudents(prev => prev.map(r => r.id === rowId ? { ...r, _db_total: r.total_mark, _db_avg: r.average_mark, _db_absent: r.count_absent } : r))
      setRowSaved(prev => ({ ...prev, [rowId]: true }))
      setTimeout(() => setRowSaved(prev => ({ ...prev, [rowId]: false })), 2000)
    }
    setRowSaving(prev => ({ ...prev, [rowId]: false }))
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
    <PageShell
      title={activeExamId !== null ? `Part 2 – Total & Average (Exam ${activeExamId})` : 'Part 2 – Total & Average'}
      backHref={activeExamId !== null ? `/exam-panel/${activeExamId}` : '/dashboard'}
    >
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
                      <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#fcfcfd' }}>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{s.iid}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{s.class ?? '—'}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{s.section ?? '—'}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{s.roll ?? '—'}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 600, background: '#f0f9ff' }}>{s.total_mark ?? ''}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 600, background: '#f0f9ff' }}>{s.average_mark ?? ''}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 600, background: '#f0f9ff' }}>{s.count_absent ?? ''}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>
                          <button
                            onClick={() => saveRow(s.id)}
                            disabled={rowSaving[s.id]}
                            style={{
                              fontSize: '11px', padding: '3px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                              background: rowSaved[s.id] ? '#1a7f37' : dirty ? '#ff8a00' : '#0366d6',
                              color: '#fff', fontWeight: 500,
                            }}
                          >
                            {rowSaved[s.id] ? '✅ Saved' : rowSaving[s.id] ? '…' : 'Update'}
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

