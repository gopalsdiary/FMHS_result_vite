import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

interface SubjectMap { Total?: string; GPA?: string }

interface StudentRow extends Record<string, unknown> {
  id: number
  exam_id: number | null
  iid: string
  class: string | null
  section: string | null
  roll: number | null
  total_mark: number | null
  average_mark: number | null
  count_absent: number | null
  gpa_final: string | number | null
  class_rank: number | null
  remark: string | null
  // DB snapshots
  _db_gpa: string | number | null
  _db_rank: number | null
  _db_remark: string | null
}

function extractFailCount(remark: string | null): number {
  if (!remark) return 0
  const m = remark.match(/fail:\s*(\d+)/i)
  return m ? parseInt(m[1]) : 0
}

function isDirty(s: StudentRow): boolean {
  const normG = (v: string | number | null) => (v == null || v === '') ? null : Number(v)
  const gMatch = Math.abs((normG(s.gpa_final) ?? -999) - (normG(s._db_gpa) ?? -999)) < 0.001
    && (normG(s.gpa_final) == null) === (normG(s._db_gpa) == null)
  const rMatch = (s.class_rank == null && s._db_rank == null) || Number(s.class_rank) === Number(s._db_rank)
  const remark = (s.remark ?? '').trim()
  const dbRemark = (s._db_remark ?? '').trim()
  return !gMatch || !rMatch || remark !== dbRemark
}

export default function GpaFinalPage() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const hasExamParam = examId !== undefined
  const parsedExamId = hasExamParam ? Number(examId) : null
  const invalidExamParam = hasExamParam && !Number.isFinite(parsedExamId)
  const activeExamId = !invalidExamParam && hasExamParam ? parsedExamId : null
  const [students, setStudents] = useState<StudentRow[]>([])
  const [detectedSubjects, setDetectedSubjects] = useState<string[]>([])
  const [subjectMap, setSubjectMap] = useState<Record<string, SubjectMap>>({})
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [rowSaving, setRowSaving] = useState<Record<number, boolean>>({})
  const [rowSaved, setRowSaved] = useState<Record<number, boolean>>({})
  const [subjectRules, setSubjectRules] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) navigate('/login', { replace: true })
    })
  }, [navigate])

  const loadAll = useCallback(async () => {
    if (invalidExamParam) {
      setLoading(false)
      setStatus(`Invalid exam id in URL: ${examId}`)
      return
    }

    setLoading(true); setStatus(activeExamId !== null ? `Loading students for exam ${activeExamId}…` : 'Loading all students…')
    
    // Load rules for pass marks
    const { data: rules } = await supabase.from('FMHS_exam_subjects').select('*').eq('exam_id', activeExamId)
    setSubjectRules(rules || [])

    // Detect subjects from table schema
    let sampleQuery = supabase.from('fmhs_exam_data').select('*').limit(1)
    if (activeExamId !== null) {
      sampleQuery = sampleQuery.eq('exam_id', activeExamId)
    }

    const { data: sample } = await sampleQuery
    const compRe = /(.+?)(?:_|\s)(Total|GPA)$/i
    const smap: Record<string, SubjectMap> = {}
    if (sample?.length) {
      Object.keys(sample[0]).forEach(k => {
        const m = k.match(compRe)
        if (m && k.startsWith('*')) {
          const base = m[1].trim()
          const comp = m[2].toLowerCase() === 'total' ? 'Total' : 'GPA'
          smap[base] = smap[base] ?? {}
          ;(smap[base] as Record<string, string>)[comp] = k
        }
      })
    }
    const subjects = Object.keys(smap).sort((a, b) =>
      a.replace(/^\*+\s*/, '').localeCompare(b.replace(/^\*+\s*/, ''))
    )
    setDetectedSubjects(subjects)
    setSubjectMap(smap)

    // Build select: core cols + all subject GPA and Total cols
    const coreCols = 'id, exam_id, iid, class, section, roll, total_mark, average_mark, count_absent, gpa_final, class_rank, remark'
    const subjCols = subjects.flatMap(s => {
      const cols: string[] = []
      if (smap[s].GPA) cols.push(`"${smap[s].GPA}"`)
      if (smap[s].Total) cols.push(`"${smap[s].Total}"`)
      return cols
    }).join(', ')
    const selectStr = subjCols ? `${coreCols}, ${subjCols}` : coreCols

    let query = supabase
      .from('fmhs_exam_data')
      .select(selectStr)

    if (activeExamId !== null) {
      query = query.eq('exam_id', activeExamId)
    }

    const { data, error } = await query
      .order('class', { ascending: false })
      .order('section', { ascending: false })
      .order('roll', { ascending: false })

    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }

    const rows = (data ?? []).map(r => {
      const row = r as unknown as Record<string, unknown>
      return {
        ...row,
        id: Number(row.id),
        exam_id: row.exam_id as number | null,
        _db_gpa: row.gpa_final as string | number | null,
        _db_rank: row.class_rank as number | null,
        _db_remark: row.remark as string | null,
      }
    }) as StudentRow[]

    setStudents(rows)
    setStatus(activeExamId !== null ? `Loaded ${rows.length} students for exam ${activeExamId}` : `Loaded ${rows.length} students`)
    setLoading(false)
  }, [activeExamId, examId, invalidExamParam])

  useEffect(() => { loadAll() }, [loadAll])

  function updateCalculations(rows: StudentRow[]): StudentRow[] {
    return rows.map(student => {
      let totalMarks = 0, validSubjects = 0
      let failCount = 0, gpaSum = 0, gpaSubjectsCount = 0

      detectedSubjects.forEach(subject => {
        const totalCol = subjectMap[subject]?.Total
        const gpaCol = subjectMap[subject]?.GPA
        if (totalCol) {
          const marks = parseFloat(String(student[totalCol] ?? 0)) || 0
          if (marks > 0) {
            totalMarks += marks
            validSubjects++
          }
        }
        if (gpaCol) {
          const raw = student[gpaCol]
          const rawStr = (raw === null || raw === undefined) ? '' : String(raw).trim()
          if (rawStr === '') return
          const isF = rawStr.toUpperCase() === 'F'
          const g = isF ? 0 : parseFloat(rawStr)
          if (!isNaN(g)) {
            gpaSum += g
            gpaSubjectsCount++
            if (g <= 0) failCount++
          }
        }
      })

      const countAbsent = Math.max(0, 9 - validSubjects)
      const avgCalc = validSubjects > 0 ? Math.round(totalMarks / validSubjects) : 0
      const remark = failCount > 0 ? `fail: ${failCount}` : ''

      let gpaFinal: string | number | null = null
      if ((failCount + countAbsent) > 0) {
        gpaFinal = null
      } else if (gpaSubjectsCount > 0) {
        const raw = Math.min(5, gpaSum / 9)
        gpaFinal = isNaN(raw) ? null : parseFloat(raw.toFixed(2))
      }

      return {
        ...student,
        total_mark: totalMarks || null,
        average_mark: avgCalc || null,
        count_absent: countAbsent || null,
        gpa_final: gpaFinal,
        remark: remark || null,
      }
    })
  }

  function calcClassRanks(rows: StudentRow[]): StudentRow[] {
    const groups: Record<string, StudentRow[]> = {}
    rows.forEach(s => {
      const key = `${s.exam_id ?? 'all'}_${s.class}_${s.section}`
      groups[key] = groups[key] ?? []
      groups[key].push(s)
    })

    const result = [...rows]
    Object.values(groups).forEach(group => {
      const eligible = group.filter(s => (s.total_mark ?? 0) > 0 && !(s.count_absent && s.count_absent > 0))
      eligible.sort((a, b) => {
        const gA = a.gpa_final != null ? Number(a.gpa_final) : null
        const gB = b.gpa_final != null ? Number(b.gpa_final) : null
        if (gA !== null && gB !== null) {
          if (Math.abs(gA - gB) > 0.001) return gB - gA
          if ((b.total_mark ?? 0) !== (a.total_mark ?? 0)) return (b.total_mark ?? 0) - (a.total_mark ?? 0)
          return (a.roll ?? 999999) - (b.roll ?? 999999)
        }
        if (gA !== null) return -1; if (gB !== null) return 1
        const fA = extractFailCount(a.remark), fB = extractFailCount(b.remark)
        if (fA !== fB) return fA - fB
        if ((b.total_mark ?? 0) !== (a.total_mark ?? 0)) return (b.total_mark ?? 0) - (a.total_mark ?? 0)
        return (a.roll ?? 999999) - (b.roll ?? 999999)
      })
      eligible.forEach((s, rank) => {
        const idx = result.findIndex(r => r.id === s.id)
        if (idx >= 0) result[idx] = { ...result[idx], class_rank: rank + 1 }
      })
      group.forEach(s => {
        if (!eligible.find(e => e.id === s.id)) {
          const idx = result.findIndex(r => r.id === s.id)
          if (idx >= 0) result[idx] = { ...result[idx], class_rank: null }
        }
      })
    })
    return result
  }

  function handleUpdateCalculations() {
    const updated = calcClassRanks(updateCalculations(students))
    setStudents(updated)
    setStatus('Calculations updated successfully! — click "Update Database" to save')
  }

  async function handleUpdateDatabase() {
    if (!window.confirm('Are you sure you want to update the database with GPA Final, Class Rank and Remark?')) return
    if (invalidExamParam) {
      setStatus(`Invalid exam id in URL: ${examId}`)
      return
    }
    setStatus('Updating database…')
    const recalculated = calcClassRanks(updateCalculations(students))
    const updates = recalculated.map(s => ({
      id: s.id,
      exam_id: s.exam_id ?? activeExamId,
      iid: s.iid,
      gpa_final: s.gpa_final === null ? null : parseFloat(String(s.gpa_final)),
      class_rank: s.class_rank ?? null,
      remark: s.remark ?? null,
    }))
    const { error } = await supabase.from('fmhs_exam_data').upsert(updates, { onConflict: 'id' })
    if (!error) {
      setStudents(recalculated.map(s => ({
        ...s,
        _db_gpa: s.gpa_final,
        _db_rank: s.class_rank,
        _db_remark: s.remark,
      })))
      setStatus('Database updated successfully!')
    } else {
      setStatus('Error: ' + error.message)
    }
  }

  async function saveRow(rowId: number) {
    const s = students.find(r => r.id === rowId)
    if (!s) return
    setRowSaving(prev => ({ ...prev, [rowId]: true }))
    if (window.confirm(`Save to database?\n\nGPA Final: ${s.gpa_final ?? ''}\nClass Rank: ${s.class_rank ?? ''}\nRemark: ${s.remark ?? ''}`)) {
      const { error } = await supabase.from('fmhs_exam_data').update({
        gpa_final: s.gpa_final === null ? null : parseFloat(String(s.gpa_final)),
        class_rank: s.class_rank ?? null,
        remark: s.remark ?? null,
      }).eq('id', s.id)
      if (!error) {
        setStudents(prev => prev.map(r => r.id === rowId ? { ...r, _db_gpa: r.gpa_final, _db_rank: r.class_rank, _db_remark: r.remark } : r))
        setRowSaved(prev => ({ ...prev, [rowId]: true }))
        setTimeout(() => setRowSaved(prev => ({ ...prev, [rowId]: false })), 2000)
        setStatus(`Row ${s.iid} saved successfully!`)
      }
    }
    setRowSaving(prev => ({ ...prev, [rowId]: false }))
  }

  const thHoriz: React.CSSProperties = {
    padding: '6px 8px', background: '#f0f3f6', border: '1px solid #d0d7de',
    fontWeight: 600, fontSize: '12.5px', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap',
  }
  const thVert: React.CSSProperties = {
    writingMode: 'vertical-rl', textOrientation: 'mixed', verticalAlign: 'bottom',
    height: '120px', minWidth: '50px', padding: '8px 4px',
    background: '#f0f3f6', border: '1px solid #d0d7de',
    fontWeight: 600, fontSize: '12.5px', textAlign: 'center', whiteSpace: 'nowrap',
    borderBottom: '2px solid #d0d7de',
  }

  return (
    <PageShell
      title={activeExamId !== null ? `Part 4 – GPA Finalization (Exam ${activeExamId})` : 'Part 4 – GPA Finalization'}
      backHref={activeExamId !== null ? `/exam-panel/${activeExamId}` : '/dashboard'}
    >
      {() => (
        <div>
          {/* Toolbar */}
          <div className="card" style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={loadAll} disabled={loading}>
                📊 Refresh Data
              </button>
              <button className="btn btn-success" onClick={handleUpdateCalculations} disabled={loading || students.length === 0}>
                🔄 Update Calculations
              </button>
              <button
                className="btn btn-outline"
                onClick={handleUpdateDatabase}
                disabled={loading || students.length === 0}
              >
                💾 Update Database
              </button>
              {status && <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: status.startsWith('Error') ? '#d73a49' : status.includes('successfully') ? '#1a7f37' : '#555' }}>{status}</span>}
            </div>
          </div>

          {loading && <div className="spinner" />}

          {!loading && students.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #d0d7de', borderRadius: '6px' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #d0d7de', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '1.1rem', color: '#24292f' }}>Grade View</span>
                <span style={{ fontSize: '13px', color: '#6a737d' }}>{students.length} students</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '13.5px', width: '100%', background: '#fff' }}>
                  <thead>
                    <tr>
                      <th style={thHoriz}>IID</th>
                      <th style={{ ...thHoriz, minWidth: '110px' }}>Action</th>
                      <th style={thHoriz}>GPA Final</th>
                      <th style={thHoriz}>Class Rank</th>
                      <th style={thHoriz}>Remark</th>
                      <th style={thHoriz}>Total Marks</th>
                      <th style={thHoriz}>Average</th>
                      <th style={thHoriz}>Count Absent</th>
                      {detectedSubjects.map(subject => {
                        const gpaCol = subjectMap[subject]?.GPA
                        const rule = subjectRules.find(r => r.subject_name === subject)
                        return gpaCol ? (
                          <th key={subject} style={thVert}>
                            {gpaCol}
                            <div style={{ fontSize: '9px', opacity: 0.6, fontWeight: 800, marginTop: '2px', color: '#ef4444' }}>
                              P: {rule?.pass_total ?? '--'}
                            </div>
                          </th>
                        ) : null
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => {
                      const dirty = isDirty(s)
                      const gpaDisplay = s.gpa_final == null ? '' : String(s.gpa_final)
                      return (
                        <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#fcfcfd' }}>
                          <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{s.iid}</td>
                          <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>
                            <button
                              onClick={() => saveRow(s.id)}
                              disabled={rowSaving[s.id]}
                              style={{
                                fontSize: '10px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
                                border: '1px solid',
                                background: rowSaved[s.id] ? '#1a7f37' : dirty ? '#ff8a00' : 'transparent',
                                borderColor: rowSaved[s.id] ? '#1a7f37' : dirty ? '#ff8a00' : '#0366d6',
                                color: rowSaved[s.id] ? '#fff' : dirty ? '#ff8a00' : '#0366d6',
                                fontWeight: 500,
                              }}
                            >
                              {rowSaved[s.id] ? '✅ Saved' : '📊 Update'}
                            </button>
                          </td>
                          <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 600, color: '#0366d6' }}>{gpaDisplay}</td>
                          <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 600 }}>{s.class_rank ?? ''}</td>
                          <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{s.remark ?? ''}</td>
                          <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 600, background: '#f0f9ff' }}>{s.total_mark ?? ''}</td>
                          <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 600, background: '#f0f9ff' }}>{s.average_mark ?? ''}</td>
                          <td style={{ padding: '5px 8px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 600, background: '#f0f9ff' }}>{s.count_absent && s.count_absent > 0 ? s.count_absent : ''}</td>
                          {detectedSubjects.map(subject => {
                            const gpaCol = subjectMap[subject]?.GPA
                            if (!gpaCol) return null
                            const raw = s[gpaCol]
                            const rawStr = (raw === null || raw === undefined) ? '' : String(raw).trim()
                            const isF = rawStr.toUpperCase() === 'F'
                            const num = isF ? 0 : parseFloat(rawStr)
                            let display = ''
                            if (isF) display = 'F'
                            else if (!isNaN(num) && num > 0) display = num.toFixed(1)
                            return (
                              <td key={subject} style={{ padding: '5px 4px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 500 }}>
                                {display}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
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
