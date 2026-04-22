import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import PageShell from '@/components/PageShell'

const TABLE_NAME = 'exam_ann25'

interface GradingCriteria {
  cqPass: number
  mcqPass: number
  practicalPass: number
  totalPass: number
  gradeAPlus: number
  gradeA: number
  gradeAMinus: number
  gradeB: number
  gradeC: number
  gradeD: number
}

const defaultCriteria: GradingCriteria = {
  cqPass: 16, mcqPass: 8, practicalPass: 8, totalPass: 33,
  gradeAPlus: 80, gradeA: 70, gradeAMinus: 60, gradeB: 50, gradeC: 40, gradeD: 33,
}

interface SubjectComponentMap { CQ?: string; MCQ?: string; PRACTICAL?: string; TOTAL?: string; GPA?: string }
type SubjectType = { type: 'single'; components: SubjectComponentMap } | { type: 'combined'; subjects: { base: string; components: SubjectComponentMap }[] }

interface DataRow {
  iid: string
  name: string
  roll: string | number
  cq: number; mcq: number; practical: number; total: number
  gpa: number | string | null
  originalRow: Record<string, unknown>
}

function calculateGPA(total: number, subjectName = '', criteria: GradingCriteria): number | string {
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

export default function SubjectGpaPage() {
  const navigate = useNavigate()
  const [subjects, setSubjects] = useState<Map<string, SubjectType>>(new Map())
  const [selectedSubject, setSelectedSubject] = useState('')
  const [criteria, setCriteria] = useState<GradingCriteria>(defaultCriteria)
  const [data, setData] = useState<DataRow[]>([])
  const [iidCol, setIidCol] = useState('iid')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [rowStatus, setRowStatus] = useState<Record<number, string>>({})

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
    setLoading(true); setStatus('Loading…')
    const { data: rows, error } = await supabase.from(TABLE_NAME).select('*').order(iidCol, { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }

    const subjInfo = subjects.get(subject)!
    const parsed: DataRow[] = []

    if (subjInfo.type === 'single') {
      const c = subjInfo.components
      ;(rows ?? []).forEach(row => {
        const cq = Number(row[c.CQ!]) || 0, mcq = Number(row[c.MCQ!]) || 0
        const practical = Number(row[c.PRACTICAL!]) || 0, total = Number(row[c.TOTAL!]) || 0
        const gpaRaw = c.GPA ? row[c.GPA] : null
        const hasAny = cq > 0 || mcq > 0 || practical > 0 || total > 0 || (typeof gpaRaw === 'string' && gpaRaw.trim().toUpperCase() === 'F')
        if (!hasAny) return
        parsed.push({ iid: String(row[iidCol] ?? ''), name: String(row.student_name ?? row.name ?? ''), roll: row.roll as string, cq, mcq, practical, total, gpa: gpaRaw as string | null, originalRow: row as Record<string, unknown> })
      })
    } else {
      const subs = subjInfo.subjects
      ;(rows ?? []).forEach(row => {
        if (subs.length < 2) return
        const t1 = Number(row[subs[0].components.TOTAL!]) || 0
        const t2 = Number(row[subs[1].components.TOTAL!]) || 0
        const convertedTotal = Math.round(((t1 + t2) / 150) * 100 * 100) / 100
        const firstPaper = subs.find(s => /1st/i.test(s.base)) ?? subs[0]
        const gpaRaw = firstPaper.components.GPA ? row[firstPaper.components.GPA] : null
        const hasGpa = (typeof gpaRaw === 'string' && gpaRaw.trim().toUpperCase() === 'F') || Number(gpaRaw) > 0
        if (!hasGpa && t1 <= 0 && t2 <= 0) return
        parsed.push({ iid: String(row[iidCol] ?? ''), name: String(row.student_name ?? row.name ?? ''), roll: row.roll as string, cq: 0, mcq: 0, practical: 0, total: convertedTotal, gpa: gpaRaw as string | null, originalRow: row as Record<string, unknown> })
      })
    }

    setData(parsed)
    setStatus(`Loaded ${parsed.length} records`)
    setRowStatus({})
    setLoading(false)
  }, [subjects, iidCol])

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
      else if (hasFailed) {
        gpa = selectedSubject.toLowerCase().includes('agriculture') ? 0 : 'F'
      } else {
        gpa = calculateGPA(total, selectedSubject, criteria)
      }
      return { ...row, total, gpa }
    })
    setData(updated)
    setStatus(`GPA calculated for ${updated.length} students`)
  }

  async function bulkUpdate() {
    setStatus('Updating database…')
    const subjInfo = subjects.get(selectedSubject)
    if (!subjInfo) return
    let updated = 0
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      const updatePayload: Record<string, unknown> = {}
      if (subjInfo.type === 'single') {
        const c = subjInfo.components
        if (c.TOTAL) updatePayload[c.TOTAL] = row.total
        if (c.GPA) updatePayload[c.GPA] = row.gpa
      } else {
        const firstPaper = (subjInfo as Extract<SubjectType, { type: 'combined' }>).subjects.find(s => /1st/i.test(s.base)) ?? subjInfo.subjects[0]
        if (firstPaper.components.GPA) updatePayload[firstPaper.components.GPA] = row.gpa
      }
      const { error } = await supabase.from(TABLE_NAME).update(updatePayload).eq(iidCol, row.iid)
      setRowStatus(prev => ({ ...prev, [i]: error ? '❌ Error' : '✅ Saved' }))
      if (!error) updated++
    }
    setStatus(`Updated ${updated}/${data.length} records`)
  }

  async function updateSingleRow(index: number) {
    const row = data[index]
    const subjInfo = subjects.get(selectedSubject)
    if (!subjInfo) return
    const updatePayload: Record<string, unknown> = {}
    if (subjInfo.type === 'single') {
      const c = subjInfo.components
      if (c.TOTAL) updatePayload[c.TOTAL] = row.total
      if (c.GPA) updatePayload[c.GPA] = row.gpa
    }
    const { error } = await supabase.from(TABLE_NAME).update(updatePayload).eq(iidCol, row.iid)
    setRowStatus(prev => ({ ...prev, [index]: error ? '❌ Error' : '✅ Saved' }))
  }

  return (
    <PageShell title="Part 3 – Subject GPA">
      {() => (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Grading criteria */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 600, marginBottom: '12px', color: '#24292f' }}>Grading Criteria</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {(Object.keys(defaultCriteria) as (keyof GradingCriteria)[]).map(key => (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', minWidth: '100px' }}>
                  <label style={{ fontSize: '12px' }}>{key}</label>
                  <input
                    type="number"
                    value={criteria[key]}
                    onChange={e => setCriteria(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                    style={{ padding: '6px', border: '1px solid #d0d7de', borderRadius: '4px', width: '80px' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label>Subject</label>
                <select
                  value={selectedSubject}
                  onChange={e => setSelectedSubject(e.target.value)}
                  style={{ minWidth: '240px' }}
                >
                  <option value="">Choose a subject…</option>
                  {Array.from(subjects.keys()).sort().map(s => (
                    <option key={s} value={s}>{s.replace(/^\*+\s*/, '')}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary" onClick={calculateAll} disabled={data.length === 0 || loading}>
                🔄 Calculate All GPA
              </button>
              <button className="btn btn-success" onClick={bulkUpdate} disabled={data.length === 0 || loading}>
                💾 Bulk Update to DB
              </button>
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '10px' }}>{status}</div>}
          </div>

          {/* Data table */}
          {loading && <div className="spinner" />}
          {!loading && data.length > 0 && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>IID</th>
                    <th>CQ</th><th>MCQ</th><th>Practical</th>
                    <th>Total</th><th>GPA</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={row.iid}>
                      <td>{row.iid}</td>
                      <td>{row.cq || '—'}</td>
                      <td>{row.mcq || '—'}</td>
                      <td>{row.practical || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{row.total || '—'}</td>
                      <td style={{ fontWeight: 600, color: row.gpa === 'F' ? '#d73a49' : '#1a7f37' }}>
                        {row.gpa !== null && row.gpa !== undefined ? String(row.gpa) : '—'}
                      </td>
                      <td>
                        <button
                          onClick={() => updateSingleRow(i)}
                          style={{ fontSize: '12px', padding: '4px 8px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          Update
                        </button>
                        {' '}{rowStatus[i] ?? ''}
                      </td>
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
