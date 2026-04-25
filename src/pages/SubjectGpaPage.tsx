import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

const TABLE_NAME = 'fmhs_exam_data'

interface GradingCriteria {
  cqPass: number; mcqPass: number; practicalPass: number; totalPass: number
  gradeAPlus: number; gradeA: number; gradeAMinus: number; gradeB: number; gradeC: number; gradeD: number
}

const defaultCriteria: GradingCriteria = {
  cqPass: 16, mcqPass: 8, practicalPass: 8, totalPass: 33,
  gradeAPlus: 80, gradeA: 70, gradeAMinus: 60, gradeB: 50, gradeC: 40, gradeD: 33,
}

const CRITERIA_LABELS: Record<keyof GradingCriteria, string> = {
  cqPass: 'CQ Pass', mcqPass: 'MCQ Pass', practicalPass: 'Practical Pass', totalPass: 'Total Pass',
  gradeAPlus: 'A+ (5.0)', gradeA: 'A (4.0)', gradeAMinus: 'A- (3.5)',
  gradeB: 'B (3.0)', gradeC: 'C (2.0)', gradeD: 'D (1.0)',
}

interface SubjectComponentMap { CQ?: string; MCQ?: string; PRACTICAL?: string; TOTAL?: string; GPA?: string }
type SubjectType = { type: 'single'; components: SubjectComponentMap } | { type: 'combined'; subjects: { base: string; components: SubjectComponentMap }[] }

interface DataRow {
  id: number
  exam_id: number | null
  iid: string
  cq: number; mcq: number; practical: number; total: number
  gpa: number | string | null
  _db_gpa: number | string | null   // DB snapshot for dirty detection
  originalRow: Record<string, unknown>
}

interface SubjectDisplayCols {
  cqCol: string; mcqCol: string; practicalCol: string; totalCol: string; gpaCol: string
  isCombined: boolean
}

function calculateGPA(total: number, subjectName = '', criteria: GradingCriteria): number {
  if (total <= 0) return 0
  const isAgri = subjectName.toLowerCase().includes('agriculture')
  let base = 0
  if (total >= criteria.gradeAPlus) base = 5
  else if (total >= criteria.gradeA) base = 4
  else if (total >= criteria.gradeAMinus) base = 3.5
  else if (total >= criteria.gradeB) base = 3
  else if (total >= criteria.gradeC) base = 2
  else if (total >= criteria.gradeD) base = 1
  if (isAgri) return Math.max(0, base - 2)
  return base
}

function isGpaDirty(row: DataRow): boolean {
  const norm = (v: number | string | null) => v === 'F' ? 'F' : (v == null ? null : Number(v))
  const a = norm(row.gpa), b = norm(row._db_gpa)
  if (a === 'F' || b === 'F') return a !== b
  if (a == null && b == null) return false
  if (a == null || b == null) return true
  return Math.abs(Number(a) - Number(b)) > 0.001
}

export default function SubjectGpaPage() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const hasExamParam = examId !== undefined
  const parsedExamId = hasExamParam ? Number(examId) : null
  const invalidExamParam = hasExamParam && !Number.isFinite(parsedExamId ?? NaN)
  const activeExamId = !invalidExamParam && hasExamParam ? parsedExamId : null
  const [subjects, setSubjects] = useState<Map<string, SubjectType>>(new Map())
  const [selectedSubject, setSelectedSubject] = useState('')
  const [criteria, setCriteria] = useState<GradingCriteria>(defaultCriteria)
  const [data, setData] = useState<DataRow[]>([])
  const [displayCols, setDisplayCols] = useState<SubjectDisplayCols | null>(null)
  const [iidCol, setIidCol] = useState('iid')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [rowSaved, setRowSaved] = useState<Record<number, boolean>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      initSubjects()
    })
  }, [navigate])

  async function initSubjects() {
    setStatus('Loading subjects…')
    const { data: rows, error } = await supabase.from(TABLE_NAME).select('*').limit(1)
    if (error || !rows?.length) { setStatus('Error loading table: ' + error?.message); return }
    const cols = Object.keys(rows[0])
    const detectedIid = cols.find(k => /^iid$/i.test(k)) ?? cols.find(k => /iid/i.test(k)) ?? 'iid'
    setIidCol(detectedIid)

    const raw = new Map<string, SubjectComponentMap>()
    cols.forEach(col => {
      const m = col.match(/^(.+?)_(CQ|MCQ|Practical|Total|GPA)$/i)
      if (m) {
        const base = m[1].trim()
        const comp = m[2].toUpperCase() as keyof SubjectComponentMap
        if (!raw.has(base)) raw.set(base, {})
        raw.get(base)![comp] = col
      }
    })

    const processed = new Map<string, SubjectType>()
    raw.forEach((components, base) => {
      if (/bangla.*(?:1st|2nd)/i.test(base)) {
        const key = 'Bangla 1st+2nd Paper'
        if (!processed.has(key)) processed.set(key, { type: 'combined', subjects: [] })
        ;(processed.get(key) as Extract<SubjectType, { type: 'combined' }>).subjects.push({ base, components })
      } else if (/english.*(?:1st|2nd)/i.test(base)) {
        const key = 'English 1st+2nd Paper'
        if (!processed.has(key)) processed.set(key, { type: 'combined', subjects: [] })
        ;(processed.get(key) as Extract<SubjectType, { type: 'combined' }>).subjects.push({ base, components })
      } else {
        processed.set(base, { type: 'single', components })
      }
    })

    setSubjects(processed)
    setStatus(`Found ${processed.size} subjects`)
  }

  const loadSubjectData = useCallback(async (subject: string) => {
    if (!subject) return
    if (invalidExamParam) {
      setStatus(`Invalid exam id in URL: ${examId}`)
      setData([])
      setDisplayCols(null)
      setRowSaved({})
      setLoading(false)
      return
    }

    setLoading(true); setStatus('Loading…')
    let query = supabase.from(TABLE_NAME).select('*')
    if (activeExamId !== null) {
      query = query.eq('exam_id', activeExamId)
    }

    const { data: rows, error } = await query.order(iidCol, { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }

    const subjInfo = subjects.get(subject)!
    const parsed: DataRow[] = []

    if (subjInfo.type === 'single') {
      const c = subjInfo.components
      setDisplayCols({
        cqCol: c.CQ ?? '', mcqCol: c.MCQ ?? '', practicalCol: c.PRACTICAL ?? '',
        totalCol: c.TOTAL ?? '', gpaCol: c.GPA ?? '', isCombined: false,
      })
      ;(rows ?? []).forEach(row => {
        const cq = Number(row[c.CQ!]) || 0, mcq = Number(row[c.MCQ!]) || 0
        const practical = Number(row[c.PRACTICAL!]) || 0, total = Number(row[c.TOTAL!]) || 0
        const gpaRaw = c.GPA ? row[c.GPA] : null
        const hasAny = cq > 0 || mcq > 0 || practical > 0 || total > 0 || (typeof gpaRaw === 'string' && gpaRaw.trim().toUpperCase() === 'F')
        if (!hasAny) return
        parsed.push({
          id: Number(row.id),
          exam_id: row.exam_id as number | null,
          iid: String(row[iidCol] ?? ''), cq, mcq, practical, total,
          gpa: gpaRaw as string | null, _db_gpa: gpaRaw as string | null,
          originalRow: row as Record<string, unknown>,
        })
      })
    } else {
      const subs = subjInfo.subjects
      const firstPaper = subs.find(s => /1st/i.test(s.base)) ?? subs[0]
      setDisplayCols({
        cqCol: '', mcqCol: '', practicalCol: '', totalCol: '',
        gpaCol: firstPaper?.components.GPA ?? '', isCombined: true,
      })
      ;(rows ?? []).forEach(row => {
        if (subs.length < 2) return
        const t1 = Number(row[subs[0].components.TOTAL!]) || 0
        const t2 = Number(row[subs[1].components.TOTAL!]) || 0
        const convertedTotal = Math.round(((t1 + t2) / 150) * 100 * 100) / 100
        const gpaRaw = firstPaper.components.GPA ? row[firstPaper.components.GPA] : null
        const hasGpa = (typeof gpaRaw === 'string' && gpaRaw.trim().toUpperCase() === 'F') || Number(gpaRaw) > 0
        if (!hasGpa && t1 <= 0 && t2 <= 0) return
        parsed.push({
          id: Number(row.id),
          exam_id: row.exam_id as number | null,
          iid: String(row[iidCol] ?? ''), cq: 0, mcq: 0, practical: 0, total: convertedTotal,
          gpa: gpaRaw as string | null, _db_gpa: gpaRaw as string | null,
          originalRow: row as Record<string, unknown>,
        })
      })
    }

    setData(parsed)
    setRowSaved({})
    setStatus(activeExamId !== null ? `Loaded ${parsed.length} records for exam ${activeExamId}` : `Loaded ${parsed.length} records`)
    setLoading(false)
  }, [subjects, iidCol, activeExamId, invalidExamParam, examId])

  useEffect(() => {
    if (selectedSubject) loadSubjectData(selectedSubject)
  }, [selectedSubject, loadSubjectData])

  function calculateAll() {
    const subjInfo = subjects.get(selectedSubject)
    const isCombined = subjInfo?.type === 'combined'
    const updated = data.map(row => {
      const summed = row.cq + row.mcq + row.practical
      const total = summed > 0 ? summed : row.total
      let hasFailed = false
      if (!isCombined) {
        if (row.cq > 0 && row.cq < criteria.cqPass) hasFailed = true
        if (row.mcq > 0 && row.mcq < criteria.mcqPass) hasFailed = true
        if (row.practical > 0 && row.practical < criteria.practicalPass) hasFailed = true
      }
      if (total > 0 && total < criteria.totalPass) hasFailed = true
      if (total > 100) hasFailed = true

      let gpa: number | string | null = null
      if (total === 0) { gpa = null }
      else if (hasFailed) { gpa = selectedSubject.toLowerCase().includes('agriculture') ? 0 : 'F' }
      else { gpa = calculateGPA(total, selectedSubject, criteria) }
      return { ...row, total, gpa }
    })
    setData(updated)
    setStatus(`✅ Calculation completed! — click "Bulk Update to Database" to save`)
  }

  async function bulkUpdate() {
    if (!window.confirm(`Update ${data.length} records to database?`)) return
    if (invalidExamParam) {
      setStatus(`Invalid exam id in URL: ${examId}`)
      return
    }
    setStatus('Bulk updating…')
    const subjInfo = subjects.get(selectedSubject)
    if (!subjInfo) return
    const updates = data.map(row => {
      const u: Record<string, unknown> = { id: row.id, exam_id: row.exam_id ?? activeExamId, iid: row.iid }
      if (subjInfo.type === 'single') {
        const c = subjInfo.components
        if (c.TOTAL) u[c.TOTAL] = row.total || 0
        if (c.GPA) u[c.GPA] = row.gpa === 'F' ? 'F' : (row.gpa == null ? null : Number(row.gpa))
      } else {
        const fp = (subjInfo as Extract<SubjectType, { type: 'combined' }>).subjects.find(s => /1st/i.test(s.base)) ?? subjInfo.subjects[0]
        if (fp.components.GPA) u[fp.components.GPA] = row.gpa === 'F' ? 'F' : (row.gpa == null ? null : Number(row.gpa))
      }
      return u
    })
    const { error } = await supabase.from(TABLE_NAME).upsert(updates, { onConflict: 'id' })
    if (!error) {
      setData(prev => prev.map(r => ({ ...r, _db_gpa: r.gpa })))
      setStatus(`✅ Bulk update completed: ${data.length} rows updated successfully!`)
    } else {
      setStatus('Error: ' + error.message)
    }
  }

  async function updateSingleRow(rowId: number) {
    if (invalidExamParam) {
      setStatus(`Invalid exam id in URL: ${examId}`)
      return
    }
    const row = data.find(item => item.id === rowId)
    const subjInfo = subjects.get(selectedSubject)
    if (!subjInfo || !row) return
    const u: Record<string, unknown> = {}
    if (subjInfo.type === 'single') {
      const c = subjInfo.components
      if (c.TOTAL) u[c.TOTAL] = row.total || 0
      if (c.GPA) u[c.GPA] = row.gpa === 'F' ? 'F' : (row.gpa == null ? null : Number(row.gpa))
    } else {
      const fp = (subjInfo as Extract<SubjectType, { type: 'combined' }>).subjects.find(s => /1st/i.test(s.base)) ?? subjInfo.subjects[0]
      if (fp?.components.GPA) u[fp.components.GPA] = row.gpa === 'F' ? 'F' : (row.gpa == null ? null : Number(row.gpa))
    }
    const { error } = await supabase.from(TABLE_NAME).update(u).eq('id', row.id)
    if (!error) {
      setData(prev => prev.map(r => r.id === rowId ? { ...r, _db_gpa: r.gpa } : r))
      setRowSaved(prev => ({ ...prev, [rowId]: true }))
      setTimeout(() => setRowSaved(prev => ({ ...prev, [rowId]: false })), 2000)
      setStatus('Row updated successfully')
    }
  }

  const passMarkKeys: (keyof GradingCriteria)[] = ['cqPass', 'mcqPass', 'practicalPass', 'totalPass']
  const gpaKeys: (keyof GradingCriteria)[] = ['gradeAPlus', 'gradeA', 'gradeAMinus', 'gradeB', 'gradeC', 'gradeD']
  const thBase: React.CSSProperties = { padding: '6px 8px', background: '#f0f3f6', border: '1px solid #d0d7de', fontWeight: 600, fontSize: '12px', textAlign: 'center', verticalAlign: 'middle' }

  return (
    <PageShell
      title={activeExamId !== null ? `Part 3 – Subject GPA (Exam ${activeExamId})` : 'Part 3 – Subject GPA'}
      backHref={activeExamId !== null ? `/exam-panel/${activeExamId}` : '/dashboard'}
    >
      {() => (
        <div>
          <p style={{ fontSize: '14px', color: '#6a737d', marginBottom: '14px' }}>
            Subject-wise GPA Calculation — সাবজেক্ট অনুযায়ী GPA গণনা ও আপডেট
          </p>

          {/* Subject Selection */}
          <div className="card" style={{ marginBottom: '14px', background: '#f8fbff' }}>
            <div style={{ fontWeight: 600, marginBottom: '10px', color: '#495057' }}>📚 Subject Selection</div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>Select Subject</label>
              <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} style={{ minWidth: '250px' }}>
                <option value="">Choose a subject…</option>
                {Array.from(subjects.keys()).sort().map(s => (
                  <option key={s} value={s}>{s.replace(/^\*+\s*/, '')}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Manual Grading Criteria */}
          <div className="card" style={{ marginBottom: '14px', background: '#f8f9fa' }}>
            <div style={{ fontWeight: 600, marginBottom: '10px', color: '#495057' }}>⚙️ Manual Grading Criteria</div>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#495057', marginBottom: '6px' }}>Pass Marks</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {passMarkKeys.map(key => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <label style={{ fontSize: '12px', color: '#495057', fontWeight: 500 }}>{CRITERIA_LABELS[key]}:</label>
                    <input type="number" value={criteria[key]} min={0} max={100}
                      onChange={e => setCriteria(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                      style={{ width: '50px', padding: '4px', border: '1px solid #ced4da', borderRadius: '3px', fontSize: '12px' }} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#495057', marginBottom: '6px' }}>GPA Thresholds</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {gpaKeys.map(key => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <label style={{ fontSize: '12px', color: '#495057', fontWeight: 500 }}>{CRITERIA_LABELS[key]}:</label>
                    <input type="number" value={criteria[key]} min={0} max={100}
                      onChange={e => setCriteria(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                      style={{ width: '50px', padding: '4px', border: '1px solid #ced4da', borderRadius: '3px', fontSize: '12px' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="card" style={{ marginBottom: '14px', background: '#f0fff0' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
              <button
                className="btn"
                style={{ background: '#ff8a00', borderColor: '#ff8a00', color: '#fff' }}
                onClick={calculateAll} disabled={data.length === 0 || loading}
              >
                🧮 Calculate All GPA
              </button>
              <button className="btn btn-success" onClick={bulkUpdate} disabled={data.length === 0 || loading}>
                💾 Bulk Update to Database
              </button>
              {status && <span style={{ fontSize: '13px', color: status.startsWith('✅') ? '#1a7f37' : status.startsWith('Error') ? '#d73a49' : '#555' }}>{status}</span>}
            </div>
          </div>

          {/* Data Table */}
          {loading && <div className="spinner" />}
          {!loading && data.length > 0 && displayCols && (
            <div style={{ background: '#fff', border: '1px solid #d0d7de', borderRadius: '6px' }}>
              <div style={{ padding: '10px 14px', background: '#f8f9fa', borderBottom: '1px solid #d0d7de', fontWeight: 600, fontSize: '14px', color: '#495057' }}>
                📊 Data for {selectedSubject.replace(/^\*+\s*/, '')}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '13.5px', width: '100%', border: '1px solid #d0d7de' }}>
                  <thead>
                    <tr>
                      <th style={thBase}>IID</th>
                      {!displayCols.isCombined && displayCols.cqCol && <th style={thBase}>{displayCols.cqCol}</th>}
                      {!displayCols.isCombined && displayCols.mcqCol && <th style={thBase}>{displayCols.mcqCol}</th>}
                      {!displayCols.isCombined && displayCols.practicalCol && <th style={thBase}>{displayCols.practicalCol}</th>}
                      {displayCols.totalCol && <th style={thBase}>{displayCols.totalCol}</th>}
                      <th style={thBase}>{displayCols.gpaCol || 'GPA'}</th>
                      <th style={thBase}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, i) => {
                      const dirty = isGpaDirty(row)
                      const gpaDisplay = row.gpa === null ? '' : row.gpa === 'F' ? 'F' : Number(row.gpa).toFixed(2)
                      return (
                        <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#fcfcfd' }}>
                          <td style={{ padding: '6px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{row.iid}</td>
                          {!displayCols.isCombined && displayCols.cqCol && (
                            <td style={{ padding: '6px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{row.cq || ''}</td>
                          )}
                          {!displayCols.isCombined && displayCols.mcqCol && (
                            <td style={{ padding: '6px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{row.mcq || ''}</td>
                          )}
                          {!displayCols.isCombined && displayCols.practicalCol && (
                            <td style={{ padding: '6px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{row.practical || ''}</td>
                          )}
                          {displayCols.totalCol && (
                            <td style={{ padding: '6px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>{row.total || ''}</td>
                          )}
                          <td style={{ padding: '6px 8px', border: '1px solid #d0d7de', textAlign: 'center', fontWeight: 600, color: row.gpa === 'F' ? '#d73a49' : '#ff6600' }}>
                            {gpaDisplay}
                          </td>
                          <td style={{ padding: '6px 8px', border: '1px solid #d0d7de', textAlign: 'center' }}>
                            <button
                              onClick={() => updateSingleRow(row.id)}
                              style={{
                                fontSize: '11px', padding: '3px 10px', border: '1px solid', borderRadius: '4px',
                                cursor: 'pointer', fontWeight: 500,
                                background: rowSaved[row.id] ? '#1a7f37' : dirty ? '#ff8a00' : '#0366d6',
                                borderColor: rowSaved[row.id] ? '#1a7f37' : dirty ? '#ff8a00' : '#0366d6',
                                color: '#fff',
                              }}
                            >
                              {rowSaved[row.id] ? '✅ Updated' : 'Update'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && data.length === 0 && selectedSubject && (
            <div className="card" style={{ textAlign: 'center', color: '#6a737d', padding: '30px' }}>No data for this subject</div>
          )}
        </div>
      )}
    </PageShell>
  )
}

