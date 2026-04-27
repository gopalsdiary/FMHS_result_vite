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


// ── Types ───────────────────────────────────────────────────────────────────
interface SubjectCols { Total?: string; GPA?: string; Total2nd?: string } // Total2nd: 2nd paper total col for combined subjects

interface ClassSubjectInfo {
  subject_code: string
  class: number
  is_fourth_subject: boolean
  exclude_from_rank: boolean
}

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
  optional_subject?: string | null
  _rank_total?: number | null
  _db_gpa: string | number | null
  _db_rank: number | null
  _db_remark: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Component ─────────────────────────────────────────────────────────────────
export default function GpaFinalPage() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const parsedExamId = examId !== undefined ? Number(examId) : null
  const invalidExamParam = examId !== undefined && !Number.isFinite(parsedExamId)
  const activeExamId = !invalidExamParam && examId !== undefined ? parsedExamId : null

  const [students, setStudents] = useState<StudentRow[]>([])
  const [subjectCols, setSubjectCols] = useState<{ key: string; label: string; cols: SubjectCols }[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [rowSaving, setRowSaving] = useState<Record<number, boolean>>({})
  const [rowSaved, setRowSaved] = useState<Record<number, boolean>>({})
  const [subjectRules, setSubjectRules] = useState<any[]>([])
  const [classSubjectInfo, setClassSubjectInfo] = useState<ClassSubjectInfo[]>([])
  const [optionalSubjectMap, setOptionalSubjectMap] = useState<Record<string, string>>({})
  const [rankMode, setRankMode] = useState<'standard' | 'fail' | 'absent'>('standard')
  const [absentRankCount, setAbsentRankCount] = useState<number>(1)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) navigate('/login', { replace: true })
    })
  }, [navigate])

  const loadAll = useCallback(async () => {
    if (invalidExamParam) { setStatus(`Invalid exam id: ${examId}`); return }
    setLoading(true)
    setStatus(activeExamId !== null ? `Loading exam ${activeExamId}…` : 'Loading…')

    // 1. Load subject rules + class assignments + optional subjects
    const examConfig = activeExamId !== null
      ? await loadExamSubjectContext(activeExamId)
      : { rules: [], classAssignments: [] as ClassSubjectInfo[] }
    setSubjectRules(examConfig.rules || [])
    setClassSubjectInfo(examConfig.classAssignments || [])
    setOptionalSubjectMap(activeExamId !== null ? await loadOptionalSubjectMapForExam(activeExamId) : {})

    // 2. Detect subject columns from DB schema (only Total + GPA cols)
    let sampleQ = supabase.from('FMHS_exam_data').select('*').limit(1)
    if (activeExamId !== null) sampleQ = sampleQ.eq('exam_id', activeExamId)
    const { data: sample } = await sampleQ

    // raw column map: key = stripped base name (no leading *)
    const rawMap: Record<string, SubjectCols> = {}
    if (sample?.length) {
      Object.keys(sample[0]).forEach(col => {
        const m = col.match(/^(\*?.+?)_(Total|GPA)$/i)
        if (!m || !col.startsWith('*')) return
        const base = m[1].trim() // includes leading *
        const comp = m[2].toLowerCase() === 'total' ? 'Total' : 'GPA'
        rawMap[base] = rawMap[base] ?? {}
        ;(rawMap[base] as any)[comp] = col
      })
    }

    // Build ordered list: combined subjects (1st+2nd paper) grouped under one entry
    const processedBases = new Set<string>()
    const colEntries: { key: string; label: string; cols: SubjectCols }[] = []
    const colMapFlat: Record<string, SubjectCols> = {}

    const sortedBases = Object.keys(rawMap).sort((a, b) => {
      const aIs1st = /1st/i.test(a), bIs1st = /1st/i.test(b)
      const aIs2nd = /2nd/i.test(a), bIs2nd = /2nd/i.test(b)
      const aBase = a.replace(/\s*(1st|2nd)\s*/i, '').toLowerCase()
      const bBase = b.replace(/\s*(1st|2nd)\s*/i, '').toLowerCase()
      if (aBase === bBase) {
        if (aIs1st && bIs2nd) return -1
        if (aIs2nd && bIs1st) return 1
      }
      return a.localeCompare(b)
    })

    sortedBases.forEach(base => {
      if (processedBases.has(base)) return
      const label = base.replace(/^\*+\s*/, '')

      const is1st = /1st/i.test(label)
      if (is1st) {
        const pairLabel = label.replace(/1st/i, '2nd')
        const pairBase = sortedBases.find(b => b.replace(/^\*+\s*/, '').toLowerCase() === pairLabel.toLowerCase())
        if (pairBase && rawMap[pairBase]) {
          const combined: SubjectCols = {
            Total: rawMap[base].Total,
            GPA: rawMap[base].GPA,
            Total2nd: rawMap[pairBase].Total,
          }
          const entryKey = label.replace(/\s*1st\s*/i, ' 1st+2nd ')
          colEntries.push({ key: entryKey, label: entryKey, cols: combined })
          colMapFlat[base] = rawMap[base]
          colMapFlat[pairBase] = rawMap[pairBase]
          processedBases.add(base)
          processedBases.add(pairBase)
          return
        }
      }
      if (/2nd/i.test(label)) {
        const pairLabel = label.replace(/2nd/i, '1st')
        const pairExists = sortedBases.some(b => b.replace(/^\*+\s*/, '').toLowerCase() === pairLabel.toLowerCase())
        if (pairExists) {
          processedBases.add(base)
          return
        }
      }

      processedBases.add(base)
      colEntries.push({ key: base, label, cols: rawMap[base] })
      colMapFlat[base] = rawMap[base]
    })

    setSubjectCols(colEntries)

    const coreCols = 'id,exam_id,iid,class,section,roll,total_mark,average_mark,count_absent,gpa_final,class_rank,remark'
    const extraCols = Object.values(rawMap).flatMap(sc => {
      const c: string[] = []
      if (sc.Total) c.push(`"${sc.Total}"`)
      if (sc.GPA) c.push(`"${sc.GPA}"`)
      return c
    }).join(',')
    const selectStr = extraCols ? `${coreCols},${extraCols}` : coreCols

    const rows = await fetchAllRows<Record<string, unknown>>(async (from, to) => {
      let q = supabase.from('FMHS_exam_data').select(selectStr)
      if (activeExamId !== null) q = q.eq('exam_id', activeExamId)
      return q.order('class', { ascending: false })
              .order('section', { ascending: true })
              .order('roll', { ascending: true })
              .range(from, to) as any
    })

    const mapped = rows.map(r => ({
      ...r,
      id: Number(r.id),
      exam_id: r.exam_id as number | null,
      _db_gpa: r.gpa_final as string | number | null,
      _db_rank: r.class_rank as number | null,
      _db_remark: r.remark as string | null,
    })) as StudentRow[]

    setStudents(mapped)
    setStatus(`Loaded ${mapped.length} students`)
    setLoading(false)
  }, [activeExamId, examId, invalidExamParam])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Core calculation ────────────────────────────────────────────────────────
  function calcStudent(student: StudentRow, subjectLookup: any, classFlagsByClass: any): Partial<StudentRow> {
    const studentClass = Number(student.class) || 0
    const studentIid = String(student.iid ?? '')
    const studentOptSub = optionalSubjectMap[studentIid] || ''

    const classFlags = classFlagsByClass[studentClass] ?? {
      subjectCodes: new Set<string>(),
      fourthSubjectCodes: new Set<string>(),
      excludeFromRankCodes: new Set<string>(),
    }
    const hasAssignments = classFlags.subjectCodes.size > 0

    let totalMarks = 0
    let rankTotalMarks = 0
    let validSubjects = 0
    let attendedMain = 0
    let expectedMain = 0
    let gpaSum = 0
    let gpaMainCount = 0
    let failCount = 0

    const classFourthCodes = classFlags.fourthSubjectCodes 
    let studentFourthCode: string | null = null

    if (studentOptSub && classFourthCodes.size > 0) {
      for (const rule of subjectRules) {
        const c = normalizeSubjectValue(rule.subject_code)
        if (classFourthCodes.has(c) && subjectMatchesOptional(studentOptSub, rule)) {
          studentFourthCode = c
          break
        }
      }
    }

    if (!studentFourthCode && classFourthCodes.size > 0) {
      studentFourthCode = [...classFourthCodes][0]
    }

    subjectCols.forEach(sc => {
      const gpaCol = sc.cols.GPA
      const totalCol = sc.cols.Total
      const total2ndCol = sc.cols.Total2nd 

      if (!gpaCol) return 

      const resolveLabel = sc.label.replace(/1st\+2nd/i, '1st')
      const rule = resolveSubjectRule(subjectLookup, resolveLabel)
      if (!rule) return 

      const code = normalizeSubjectValue(rule.subject_code)
      if (hasAssignments && !classFlags.subjectCodes.has(code)) return

      const isExcluded = classFlags.excludeFromRankCodes.has(code)
      const isClassFourth = classFourthCodes.has(code)
      const isStudentFourth = isClassFourth && code === studentFourthCode

      if (isClassFourth && !isStudentFourth) return

      const t1 = totalCol ? Number(student[totalCol]) || 0 : 0
      const t2 = total2ndCol ? Number(student[total2ndCol]) || 0 : 0
      const subjectTotal = t1 + t2

      const rawGpa = student[gpaCol]
      const gpaStr = String(rawGpa ?? '').trim()
      const isFail = gpaStr.toUpperCase() === 'F'
      const gpaNum = isFail ? 0 : (parseFloat(gpaStr) || 0)
      const hasGpa = isFail || gpaNum > 0
      const attended = subjectTotal > 0

      if (subjectTotal > 0) {
        totalMarks += subjectTotal
        validSubjects++
        if (!isExcluded) rankTotalMarks += subjectTotal
      }

      if (isStudentFourth) {
        if (hasGpa && !isFail && gpaNum > 0) {
          gpaSum += Math.max(0, gpaNum - 2)
        }
      } else if (!isExcluded) {
        expectedMain++
        if (attended) attendedMain++
        if (hasGpa) {
          gpaMainCount++
          if (isFail) failCount++
          else gpaSum += gpaNum
        }
      }
    })

    const countAbsent = Math.max(0, expectedMain - attendedMain)
    const avgCalc = validSubjects > 0 ? Math.round(totalMarks / validSubjects) : 0

    const failRem = failCount > 0 ? `fail: ${failCount}` : ''
    const absRem = countAbsent > 0 ? `absent: ${countAbsent}` : ''
    const remark = [failRem, absRem].filter(Boolean).join(', ')

    let gpaFinal: number | null = null
    if (failCount === 0 && countAbsent === 0 && gpaMainCount > 0) {
      const divisor = expectedMain > 0 ? expectedMain : gpaMainCount
      const raw = Math.min(5, gpaSum / divisor)
      gpaFinal = isNaN(raw) ? null : parseFloat(raw.toFixed(2))
    }

    return {
      total_mark: totalMarks || null,
      average_mark: avgCalc || null,
      count_absent: countAbsent || null,
      fail_count: failCount,
      gpa_final: gpaFinal,
      remark: remark || null,
      optional_subject: studentOptSub || null,
      _rank_total: rankTotalMarks || null,
    }
  }

  function updateCalculations(rows: StudentRow[]): StudentRow[] {
    const subjectLookup = buildSubjectLookup(subjectRules)
    const classFlagsByClass = buildClassSubjectFlags(classSubjectInfo)
    return rows.map(s => ({ ...s, ...calcStudent(s, subjectLookup, classFlagsByClass) }))
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
      let eligible: StudentRow[] = []
      
      if (rankMode === 'standard') {
        // Only passing students
        eligible = group.filter(s =>
          (s.total_mark ?? 0) > 0 && 
          !(s.count_absent && Number(s.count_absent) > 0) && 
          s.gpa_final != null
        )
        eligible.sort((a, b) => {
          const gA = Number(a.gpa_final), gB = Number(b.gpa_final)
          if (Math.abs(gA - gB) > 0.001) return gB - gA
          const rA = a._rank_total ?? a.total_mark ?? 0
          const rB = b._rank_total ?? b.total_mark ?? 0
          if (rB !== rA) return (rB as number) - (rA as number)
          return (a.roll ?? 999999) - (b.roll ?? 999999)
        })
      } else if (rankMode === 'fail') {
        // UNIFIED RANK: Passing students first, then Failed/Absent students
        const passers = group.filter(s =>
          (s.total_mark ?? 0) > 0 && 
          !(s.count_absent && Number(s.count_absent) > 0) && 
          s.gpa_final != null
        )
        passers.sort((a, b) => {
          const gA = Number(a.gpa_final), gB = Number(b.gpa_final)
          if (Math.abs(gA - gB) > 0.001) return gB - gA
          const rA = a._rank_total ?? a.total_mark ?? 0
          const rB = b._rank_total ?? b.total_mark ?? 0
          if (rB !== rA) return (rB as number) - (rA as number)
          return (a.roll ?? 999999) - (b.roll ?? 999999)
        })

        const failures = group.filter(s => 
          (s.total_mark ?? 0) > 0 && 
          ( (s.fail_count as number ?? 0) > 0 || (Number(s.count_absent) > 0) ) &&
          s.gpa_final == null
        )
        failures.sort((a, b) => {
          // Treat Absent as Fail for combined ranking
          const fA = (a.fail_count as number ?? 0) + Number(a.count_absent ?? 0)
          const fB = (b.fail_count as number ?? 0) + Number(b.count_absent ?? 0)
          if (fA !== fB) return fA - fB 
          const rA = a._rank_total ?? a.total_mark ?? 0
          const rB = b._rank_total ?? b.total_mark ?? 0
          return (rB as number) - (rA as number)
        })

        eligible = [...passers, ...failures]
      } else if (rankMode === 'absent') {
        // Specific absent count mode (only those students)
        eligible = group.filter(s => (s.total_mark ?? 0) > 0 && Number(s.count_absent) === absentRankCount)
        eligible.sort((a, b) => {
          const rA = a._rank_total ?? a.total_mark ?? 0
          const rB = b._rank_total ?? b.total_mark ?? 0
          return (rB as number) - (rA as number)
        })
      }

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
    setStatus('Calculations updated — click "Update Database" to save')
  }

  function buildUpdatePayload(s: StudentRow) {
    return {
      total_mark: s.total_mark ?? null,
      average_mark: s.average_mark ?? null,
      count_absent: s.count_absent === null ? null : String(s.count_absent),
      gpa_final: s.gpa_final === null ? null : parseFloat(String(s.gpa_final)),
      class_rank: s.class_rank ?? null,
      remark: s.remark ?? null,
    }
  }

  async function handleUpdateDatabase() {
    if (!window.confirm('Update database?')) return
    if (invalidExamParam) return
    setStatus('Updating database…')
    const recalculated = calcClassRanks(updateCalculations(students))
    const updates = recalculated.map(s => ({ id: s.id, exam_id: s.exam_id ?? activeExamId, iid: s.iid, ...buildUpdatePayload(s) }))
    const { error } = await supabase.from('FMHS_exam_data').upsert(updates, { onConflict: 'id' })
    if (!error) {
      setStudents(recalculated.map(s => ({ ...s, _db_gpa: s.gpa_final, _db_rank: s.class_rank, _db_remark: s.remark })))
      setStatus('Database updated successfully!')
    } else {
      setStatus('Error: ' + error.message)
    }
  }

  async function saveRow(rowId: number) {
    const s = students.find(r => r.id === rowId)
    if (!s) return
    setRowSaving(prev => ({ ...prev, [rowId]: true }))
    const { error } = await supabase.from('FMHS_exam_data').update({ id: s.id, ...buildUpdatePayload(s) }).eq('id', s.id)
    if (!error) {
      setStudents(prev => prev.map(r => r.id === rowId ? { ...r, _db_gpa: r.gpa_final, _db_rank: r.class_rank, _db_remark: r.remark } : r))
      setRowSaved(prev => ({ ...prev, [rowId]: true }))
      setTimeout(() => setRowSaved(prev => ({ ...prev, [rowId]: false })), 2000)
    }
    setRowSaving(prev => ({ ...prev, [rowId]: false }))
  }

  const thH: React.CSSProperties = { padding: '6px 8px', background: '#f0f3f6', border: '1px solid #d0d7de', fontWeight: 600, fontSize: '12px', textAlign: 'center' }
  const thV: React.CSSProperties = { writingMode: 'vertical-rl', textOrientation: 'mixed', height: '130px', minWidth: '52px', padding: '8px 4px', background: '#f0f3f6', border: '1px solid #d0d7de', fontWeight: 600, fontSize: '11px', textAlign: 'center' }
  const td: React.CSSProperties = { padding: '5px 6px', border: '1px solid #d0d7de', textAlign: 'center', fontSize: '13px' }

  return (
    <PageShell title={activeExamId !== null ? `GPA Final (Exam ${activeExamId})` : 'GPA Final'} backHref={activeExamId !== null ? `/exam-panel/${activeExamId}` : '/dashboard'}>
      {() => (
        <div>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={loadAll} disabled={loading}>📊 Refresh</button>
              <button className="btn btn-success" onClick={handleUpdateCalculations} disabled={loading || students.length === 0}>🔄 Calculate All</button>
              <button className="btn btn-outline" onClick={handleUpdateDatabase} disabled={loading || students.length === 0}>💾 Update Database</button>

              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', padding: '0 10px', borderLeft: '1px solid #d0d7de' }}>
                <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={rankMode === 'standard'} onChange={() => setRankMode('standard')} /> Standard
                </label>
                <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={rankMode === 'fail'} onChange={() => setRankMode('fail')} /> Fail Rank
                </label>
                <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={rankMode === 'absent'} onChange={() => setRankMode('absent')} /> Absent Rank
                </label>
                {rankMode === 'absent' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontSize: '12px' }}>Count:</span>
                    <input 
                      type="number" 
                      min={1}
                      value={absentRankCount} 
                      onChange={(e) => setAbsentRankCount(Number(e.target.value))} 
                      style={{ width: '45px', padding: '2px 4px', fontSize: '12px', border: '1px solid #d0d7de', borderRadius: '3px' }}
                    />
                  </div>
                )}
              </div>
            </div>
            {status && <div style={{ marginTop: '8px', fontSize: '13px', color: '#666' }}>{status}</div>}
          </div>

          {!loading && students.length > 0 && (
            <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #d0d7de', borderRadius: '6px' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={thH}>IID</th>
                    <th style={thH}>Action</th>
                    <th style={{ ...thH, background: '#e6f3ff' }}>GPA Final</th>
                    <th style={thH}>Rank</th>
                    <th style={thH}>Remark</th>
                    <th style={{ ...thH, background: '#e6ffe6' }}>Total</th>
                    <th style={{ ...thH, background: '#fff0e6' }}>Absent</th>
                    {subjectCols.map(sc => <th key={sc.key} style={thV}>{sc.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td style={td}>{s.iid}</td>
                      <td style={td}>
                        <button onClick={() => saveRow(s.id)} disabled={rowSaving[s.id]} style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px', background: rowSaved[s.id] ? '#1a7f37' : '#0366d6', color: '#fff', border: 'none' }}>
                          {rowSaved[s.id] ? '✅' : 'Save'}
                        </button>
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: '#0366d6' }}>{s.gpa_final ?? ''}</td>
                      <td style={td}>{s.class_rank ?? ''}</td>
                      <td style={td}>{s.remark ?? ''}</td>
                      <td style={td}>{s.total_mark ?? ''}</td>
                      <td style={td}>{s.count_absent || ''}</td>
                      {subjectCols.map(sc => (
                        <td key={sc.key} style={td}>
                          <div style={{ fontWeight: 600 }}>{String(s[sc.cols.Total!] || '')}</div>
                          <div style={{ fontSize: '11px', color: '#ff6600' }}>{String(s[sc.cols.GPA!] || '')}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
