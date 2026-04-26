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
function extractFailCount(remark: string | null): number {
  const m = remark?.match(/fail:\s*(\d+)/i)
  return m ? parseInt(m[1]) : 0
}

function isDirty(s: StudentRow): boolean {
  const n = (v: string | number | null) => (v == null || v === '') ? null : Number(v)
  const gOk = Math.abs((n(s.gpa_final) ?? -999) - (n(s._db_gpa) ?? -999)) < 0.001
    && (n(s.gpa_final) == null) === (n(s._db_gpa) == null)
  const rOk = (s.class_rank == null && s._db_rank == null) || Number(s.class_rank) === Number(s._db_rank)
  return !gOk || !rOk || (s.remark ?? '').trim() !== (s._db_remark ?? '').trim()
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GpaFinalPage() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const parsedExamId = examId !== undefined ? Number(examId) : null
  const invalidExamParam = examId !== undefined && !Number.isFinite(parsedExamId)
  const activeExamId = !invalidExamParam && examId !== undefined ? parsedExamId : null

  const [students, setStudents] = useState<StudentRow[]>([])
  const [subjectCols, setSubjectCols] = useState<{ key: string; label: string; cols: SubjectCols }[]>([])
  const [subjectColMap, setSubjectColMap] = useState<Record<string, SubjectCols>>({})
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [rowSaving, setRowSaving] = useState<Record<number, boolean>>({})
  const [rowSaved, setRowSaved] = useState<Record<number, boolean>>({})
  const [subjectRules, setSubjectRules] = useState<any[]>([])
  const [classSubjectInfo, setClassSubjectInfo] = useState<ClassSubjectInfo[]>([])
  const [optionalSubjectMap, setOptionalSubjectMap] = useState<Record<string, string>>({})

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
    let sampleQ = supabase.from('fmhs_exam_data').select('*').limit(1)
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
    // IMPORTANT: Always process 1st paper before 2nd to ensure correct pairing
    const processedBases = new Set<string>()
    const colEntries: { key: string; label: string; cols: SubjectCols }[] = []
    const colMapFlat: Record<string, SubjectCols> = {}

    // Sort so 1st paper always comes before 2nd paper
    const sortedBases = Object.keys(rawMap).sort((a, b) => {
      const aIs1st = /1st/i.test(a), bIs1st = /1st/i.test(b)
      const aIs2nd = /2nd/i.test(a), bIs2nd = /2nd/i.test(b)
      // 1st paper before 2nd paper for same subject
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

      // Check for 1st/2nd paper pairing (only from 1st paper side)
      const is1st = /1st/i.test(label)
      if (is1st) {
        const pairLabel = label.replace(/1st/i, '2nd')
        const pairBase = sortedBases.find(b => b.replace(/^\*+\s*/, '').toLowerCase() === pairLabel.toLowerCase())
        if (pairBase && rawMap[pairBase]) {
          // Combined entry:
          // - GPA comes from 1st paper GPA col (SubjectGpaPage stores combined GPA there)
          // - Total2nd = 2nd paper Total col (for sum calculation)
          const combined: SubjectCols = {
            Total: rawMap[base].Total,       // 1st paper total col
            GPA: rawMap[base].GPA,           // combined GPA col (stored in 1st paper by SubjectGpaPage)
            Total2nd: rawMap[pairBase].Total, // 2nd paper total col
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
      // Skip standalone 2nd paper (should have been paired above)
      if (/2nd/i.test(label)) {
        const pairLabel = label.replace(/2nd/i, '1st')
        const pairExists = sortedBases.some(b => b.replace(/^\*+\s*/, '').toLowerCase() === pairLabel.toLowerCase())
        if (pairExists) {
          // This 2nd paper should have been handled when 1st paper was processed
          // but if it wasn't (shouldn't happen after sorting fix), skip it
          processedBases.add(base)
          return
        }
      }

      processedBases.add(base)
      colEntries.push({ key: base, label, cols: rawMap[base] })
      colMapFlat[base] = rawMap[base]
    })

    setSubjectCols(colEntries)
    setSubjectColMap(colMapFlat)

    // 3. Build select string: core + all subject Total + GPA cols
    const coreCols = 'id,exam_id,iid,class,section,roll,total_mark,average_mark,count_absent,gpa_final,class_rank,remark'
    const extraCols = Object.values(rawMap).flatMap(sc => {
      const c: string[] = []
      if (sc.Total) c.push(`"${sc.Total}"`)
      if (sc.GPA) c.push(`"${sc.GPA}"`)
      return c
    }).join(',')
    const selectStr = extraCols ? `${coreCols},${extraCols}` : coreCols

    const rows = await fetchAllRows<Record<string, unknown>>(async (from, to) => {
      let q = supabase.from('fmhs_exam_data').select(selectStr)
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
  // GPA Final is derived from EXISTING subject GPA columns (already saved by SubjectGpaPage)
  // Iterates over subjectCols (already correctly paired 1st+2nd paper) — avoids double counting
  // 4th subject: GPA - 2, NOT counted in divisor, absent doesn't count
  // Excluded subjects: not counted in total, GPA, rank
  function calcStudent(student: StudentRow): Partial<StudentRow> {
    const studentClass = Number(student.class) || 0
    const studentIid = String(student.iid ?? '')
    const studentOptSub = optionalSubjectMap[studentIid] || ''

    const classFlagsByClass = buildClassSubjectFlags(classSubjectInfo)
    const classFlags = classFlagsByClass[studentClass] ?? {
      subjectCodes: new Set<string>(),
      fourthSubjectCodes: new Set<string>(),
      excludeFromRankCodes: new Set<string>(),
    }
    const hasAssignments = classFlags.subjectCodes.size > 0
    const subjectLookup = buildSubjectLookup(subjectRules)

    let totalMarks = 0
    let rankTotalMarks = 0
    let validSubjects = 0
    let attendedMain = 0
    let expectedMain = 0
    let gpaSum = 0
    let gpaMainCount = 0
    let failCount = 0

    // ── Determine this student's effective 4th subject code ─────────────────
    // Priority 1: match student_database.optional_subject against 4th subject candidates
    // Priority 2: if student has no optional_subject → use the subject(s) marked
    //             as 4th in Subject Rules for this class (fallback)
    const classFourthCodes = classFlags.fourthSubjectCodes // Set<string>
    let studentFourthCode: string | null = null

    if (studentOptSub && classFourthCodes.size > 0) {
      // Student has optional_subject recorded → find which 4th candidate it matches
      for (const rule of subjectRules) {
        const c = normalizeSubjectValue(rule.subject_code)
        if (classFourthCodes.has(c) && subjectMatchesOptional(studentOptSub, rule)) {
          studentFourthCode = c
          break
        }
      }
    }

    if (!studentFourthCode && classFourthCodes.size > 0) {
      // Fallback: student_database empty → Subject Rules' 4th subject applies.
      // If multiple 4th subjects in class (e.g. Agriculture + Home Science),
      // and student has no recorded choice, we cannot determine → treat first one as theirs.
      // This mirrors the physical scenario where the student attends one subject.
      studentFourthCode = [...classFourthCodes][0]
    }

    // Iterate over subjectCols — already de-duplicated and paired (1st+2nd = one entry)
    subjectCols.forEach(sc => {
      const gpaCol = sc.cols.GPA
      const totalCol = sc.cols.Total
      const total2ndCol = sc.cols.Total2nd // only for combined 1st+2nd subjects

      if (!gpaCol) return // no GPA col → skip

      // Find the subject rule for this entry
      // For combined subjects, label is like "Bangla  1st+2nd Paper" — resolve by 1st paper label
      const resolveLabel = sc.label.replace(/1st\+2nd/i, '1st')
      const rule = resolveSubjectRule(subjectLookup, resolveLabel)
      if (!rule) return // no matching rule → skip

      const code = normalizeSubjectValue(rule.subject_code)

      // Skip if not assigned to this class
      if (hasAssignments && !classFlags.subjectCodes.has(code)) return

      const isExcluded = classFlags.excludeFromRankCodes.has(code)
      const isClassFourth = classFourthCodes.has(code)
      // isStudentFourth: this subject IS the student's effective 4th subject
      // (matched from student_database, or fallback to Subject Rules' 4th subject)
      const isStudentFourth = isClassFourth && code === studentFourthCode

      // ── FIX 1: Skip other students' optional subjects entirely ─────────────
      // Class 9 may have "Agriculture" + "Home Science" both as 4th subject.
      // Student chose "Agriculture" → "Home Science" MUST be skipped for them.
      // Without this: "Home Science" inflates expectedMain → wrong absent + GPA.
      if (isClassFourth && !isStudentFourth) return

      const t1 = totalCol ? Number(student[totalCol]) || 0 : 0
      const t2 = total2ndCol ? Number(student[total2ndCol]) || 0 : 0
      const subjectTotal = t1 + t2

      const rawGpa = student[gpaCol]
      const gpaStr = String(rawGpa ?? '').trim()
      const isFail = gpaStr.toUpperCase() === 'F'
      const gpaNum = isFail ? 0 : (parseFloat(gpaStr) || 0)
      const hasGpa = isFail || gpaNum > 0

      // Absent = total marks = 0 (CQ + MCQ + Practical = 0)
      // Even if GPA = F but no marks → absent
      const attended = subjectTotal > 0

      // Accumulate display total (all subjects, including excluded & 4th)
      if (subjectTotal > 0) {
        totalMarks += subjectTotal
        validSubjects++
        // ── FIX 3: rankTotalMarks excludes "exclude_from_rank" subjects ──────
        if (!isExcluded) rankTotalMarks += subjectTotal
      }

      if (isStudentFourth) {
        // ── 4th / Optional Subject Rules ──────────────────────────────────────
        // • NOT counted in expectedMain → doesn't affect absent count or divisor
        // • NOT in attendedMain → absent in 4th never penalises Final GPA
        // • F in 4th does NOT null GPA Final (not in failCount)
        // • If passed: bonus = max(0, GPA - 2) added to gpaSum
        if (hasGpa && !isFail && gpaNum > 0) {
          gpaSum += Math.max(0, gpaNum - 2)
        }
      } else if (!isExcluded) {
        // ── Regular Main Subject ───────────────────────────────────────────────
        expectedMain++
        if (attended) attendedMain++
        if (hasGpa) {
          gpaMainCount++
          if (isFail) failCount++
          else gpaSum += gpaNum
        }
      }
      // Excluded-from-rank: marks in totalMarks, not in GPA/rank/absent.
    })

    const countAbsent = Math.max(0, expectedMain - attendedMain)
    const avgCalc = validSubjects > 0 ? Math.round(totalMarks / validSubjects) : 0

    const failRem = failCount > 0 ? `fail: ${failCount}` : ''
    const absRem = countAbsent > 0 ? `absent: ${countAbsent}` : ''
    const remark = [failRem, absRem].filter(Boolean).join(', ')

    let gpaFinal: number | null = null
    if (failCount === 0 && countAbsent === 0 && gpaMainCount > 0) {
      // Divisor = expected main subjects (NOT gpaMainCount, to handle absent correctly)
      const divisor = expectedMain > 0 ? expectedMain : gpaMainCount
      const raw = Math.min(5, gpaSum / divisor)
      gpaFinal = isNaN(raw) ? null : parseFloat(raw.toFixed(2))
    }

    return {
      total_mark: totalMarks || null,
      average_mark: avgCalc || null,
      count_absent: countAbsent || null,
      gpa_final: gpaFinal,
      remark: remark || null,
      optional_subject: studentOptSub || null,
      _rank_total: rankTotalMarks || null,
    }
  }

  function updateCalculations(rows: StudentRow[]): StudentRow[] {
    return rows.map(s => ({ ...s, ...calcStudent(s) }))
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
      const eligible = group.filter(s =>
        (s.total_mark ?? 0) > 0 && !(s.count_absent && Number(s.count_absent) > 0) && s.gpa_final != null
      )
      eligible.sort((a, b) => {
        const gA = Number(a.gpa_final), gB = Number(b.gpa_final)
        if (Math.abs(gA - gB) > 0.001) return gB - gA
        const rA = a._rank_total ?? a.total_mark ?? 0
        const rB = b._rank_total ?? b.total_mark ?? 0
        if (rB !== rA) return (rB as number) - (rA as number)
        return (a.roll ?? 999999) - (b.roll ?? 999999)
      })
      eligible.forEach((s, rank) => {
        const idx = result.findIndex(r => r.id === s.id)
        if (idx >= 0) result[idx] = { ...result[idx], class_rank: rank + 1 }
      })
      // Students not eligible get null rank
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
    const u: any = {
      total_mark: s.total_mark ?? null,
      average_mark: s.average_mark ?? null,
      count_absent: s.count_absent === null ? null : String(s.count_absent),
      gpa_final: s.gpa_final === null ? null : parseFloat(String(s.gpa_final)),
      class_rank: s.class_rank ?? null,
      remark: s.remark ?? null,
    }
    return u
  }

  async function handleUpdateDatabase() {
    if (!window.confirm('Update database with GPA Final, Class Rank, Remark, Total, Average, Count Absent?')) return
    if (invalidExamParam) { setStatus(`Invalid exam id: ${examId}`); return }
    setStatus('Updating database…')
    const recalculated = calcClassRanks(updateCalculations(students))
    const updates = recalculated.map(s => ({ id: s.id, exam_id: s.exam_id ?? activeExamId, iid: s.iid, ...buildUpdatePayload(s) }))
    const { error } = await supabase.from('fmhs_exam_data').upsert(updates, { onConflict: 'id' })
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
    if (window.confirm(`Save?\n\nGPA Final: ${s.gpa_final ?? ''}\nClass Rank: ${s.class_rank ?? ''}\nRemark: ${s.remark ?? ''}`)) {
      const { error } = await supabase.from('fmhs_exam_data').update({ id: s.id, ...buildUpdatePayload(s) }).eq('id', s.id)
      if (!error) {
        setStudents(prev => prev.map(r => r.id === rowId ? { ...r, _db_gpa: r.gpa_final, _db_rank: r.class_rank, _db_remark: r.remark } : r))
        setRowSaved(prev => ({ ...prev, [rowId]: true }))
        setTimeout(() => setRowSaved(prev => ({ ...prev, [rowId]: false })), 2000)
        setStatus(`Row ${s.iid} saved!`)
      } else {
        setStatus('Error: ' + error.message)
      }
    }
    setRowSaving(prev => ({ ...prev, [rowId]: false }))
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const thH: React.CSSProperties = {
    padding: '6px 8px', background: '#f0f3f6', border: '1px solid #d0d7de',
    fontWeight: 600, fontSize: '12px', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap',
  }
  const thV: React.CSSProperties = {
    writingMode: 'vertical-rl', textOrientation: 'mixed', verticalAlign: 'bottom',
    height: '130px', minWidth: '52px', padding: '8px 4px',
    background: '#f0f3f6', border: '1px solid #d0d7de',
    fontWeight: 600, fontSize: '11px', textAlign: 'center',
  }
  const td: React.CSSProperties = { padding: '5px 6px', border: '1px solid #d0d7de', textAlign: 'center', fontSize: '13px' }

  return (
    <PageShell
      title={activeExamId !== null ? `GPA Final (Exam ${activeExamId})` : 'GPA Final'}
      backHref={activeExamId !== null ? `/exam-panel/${activeExamId}` : '/dashboard'}
    >
      {() => (
        <div>
          {/* Toolbar */}
          <div className="card" style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={loadAll} disabled={loading}>📊 Refresh</button>
              <button className="btn btn-success" onClick={handleUpdateCalculations} disabled={loading || students.length === 0}>
                🔄 Calculate All
              </button>
              <button className="btn btn-outline" onClick={handleUpdateDatabase} disabled={loading || students.length === 0}>
                💾 Update Database
              </button>
              <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#6a737d', background: '#f8f9fa', padding: '6px 10px', borderRadius: '4px', border: '1px solid #d0d7de' }}>
                💡 Subject GPA must be calculated first in <strong>Subject GPA</strong> page. This page reads those GPAs to compute Final GPA.
              </div>
            </div>
            {status && (
              <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 500, color: status.startsWith('Error') ? '#d73a49' : status.includes('success') ? '#1a7f37' : '#555' }}>
                {status}
              </div>
            )}
          </div>

          {loading && <div className="spinner" />}

          {!loading && students.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #d0d7de', borderRadius: '6px' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #d0d7de', background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, color: '#24292f' }}>Result Sheet</span>
                <span style={{ fontSize: '13px', color: '#6a737d' }}>{students.length} students</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '13px', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={thH}>IID</th>
                      <th style={{ ...thH, minWidth: '80px' }}>Action</th>
                      <th style={{ ...thH, background: '#e6f3ff' }}>GPA Final</th>
                      <th style={thH}>Rank</th>
                      <th style={thH}>Remark</th>
                      <th style={{ ...thH, background: '#e6ffe6' }}>Total</th>
                      <th style={{ ...thH, background: '#e6ffe6' }}>Avg</th>
                      <th style={{ ...thH, background: '#fff0e6' }}>Absent</th>
                      {subjectCols.map(sc => {
                        const rule = resolveSubjectRule(subjectRules as any[], sc.label)
                        return (
                          <th key={sc.key} style={thV}>
                            <div>{sc.label}</div>
                            <div style={{ fontSize: '9px', color: '#ef4444', opacity: 0.8 }}>
                              P:{rule?.pass_total ?? '-'}
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => {
                      const dirty = isDirty(s)
                      return (
                        <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                          <td style={td}>{s.iid}</td>
                          <td style={td}>
                            <button
                              onClick={() => saveRow(s.id)}
                              disabled={rowSaving[s.id]}
                              style={{
                                fontSize: '10px', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer',
                                border: '1px solid',
                                background: rowSaved[s.id] ? '#1a7f37' : dirty ? '#ff8a00' : 'transparent',
                                borderColor: rowSaved[s.id] ? '#1a7f37' : dirty ? '#ff8a00' : '#0366d6',
                                color: rowSaved[s.id] ? '#fff' : dirty ? '#fff' : '#0366d6',
                                fontWeight: 600,
                              }}
                            >
                              {rowSaved[s.id] ? '✅' : dirty ? '💾 Save' : 'Save'}
                            </button>
                          </td>
                          <td style={{ ...td, fontWeight: 700, color: '#0366d6', background: '#f0f7ff' }}>
                            {s.gpa_final ?? ''}
                          </td>
                          <td style={{ ...td, fontWeight: 700 }}>{s.class_rank ?? ''}</td>
                          <td style={{ ...td, fontSize: '11px', color: s.remark ? '#d73a49' : undefined }}>
                            {s.remark ?? ''}
                          </td>
                          <td style={{ ...td, background: '#f0fff0', fontWeight: 600 }}>{s.total_mark ?? ''}</td>
                          <td style={{ ...td, background: '#f0fff0', fontWeight: 600 }}>{s.average_mark ?? ''}</td>
                          <td style={{ ...td, background: '#fff8f0', fontWeight: 600, color: (s.count_absent && Number(s.count_absent) > 0) ? '#d73a49' : undefined }}>
                            {s.count_absent && Number(s.count_absent) > 0 ? s.count_absent : ''}
                          </td>
                          {subjectCols.map(sc => {
                            const gVal = sc.cols.GPA ? String(s[sc.cols.GPA] ?? '').trim() : ''
                            const tVal = sc.cols.Total ? s[sc.cols.Total] : ''
                            const isF = gVal.toUpperCase() === 'F'
                            return (
                              <td key={sc.key} style={{ ...td, minWidth: '52px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 600 }}>{tVal || ''}</div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: isF ? '#d73a49' : '#ff6600' }}>
                                  {gVal || ''}
                                </div>
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
            <div className="card" style={{ textAlign: 'center', color: '#6a737d', padding: '40px' }}>
              No data loaded
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
