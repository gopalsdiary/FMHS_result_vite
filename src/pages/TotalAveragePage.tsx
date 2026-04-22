import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import PageShell from '@/components/PageShell'
import { loadExamAnn25Meta } from '@/lib/examAnn25Meta'

interface Student extends Record<string, unknown> {
  iid: string
  student_name_en: string
  class_2025: string
  section_2025: string
  roll_2025?: string | number
  total_mark?: number | null
  average_mark?: number | null
  count_absent?: string | number | null
}

function parseNumber(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export default function TotalAveragePage() {
  const navigate = useNavigate()
  const [classVal, setClassVal] = useState('')
  const [section, setSection] = useState('')
  const [classes, setClasses] = useState<string[]>([])
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, string[]>>({})
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    loadExamAnn25Meta()
      .then(meta => {
        setClasses(meta.classes)
        setSectionsByClass(meta.sectionsByClass)
      })
      .catch(() => {
        setClasses([])
        setSectionsByClass({})
      })
  }, [])

  const loadStudents = useCallback(async () => {
    if (!classVal || !section) { setStatus('Please select class and section'); return }
    setLoading(true); setStatus('Loading…')
    const { data, error } = await supabase
      .from('exam_ann25')
      .select('*')
      .eq('class_2025', classVal)
      .eq('section_2025', section)
      .order('roll_2025', { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    setStudents((data ?? []) as Student[])
    setStatus(`Loaded ${data?.length ?? 0} students for Class ${classVal} / Section ${section}`)
    setLoading(false)
  }, [classVal, section])

  async function calculateTotals() {
    if (students.length === 0) return
    setUpdating(true); setStatus('Calculating totals…')
    let updated = 0
    for (const student of students) {
      const totalColumns = Object.keys(student).filter(key => /^\*?.+_Total$/i.test(key))
      let totalMark = 0
      let validSubjects = 0

      totalColumns.forEach(key => {
        const marks = parseNumber(student[key])
        if (marks > 0) {
          totalMark += marks
          validSubjects++
        }
      })

      const avgMark = validSubjects > 0 ? Math.round(totalMark / validSubjects) : 0
      const absentCount = Math.max(0, 9 - validSubjects)

      await supabase
        .from('exam_ann25')
        .update({
          total_mark: totalMark,
          average_mark: avgMark,
          count_absent: absentCount > 0 ? String(absentCount) : null,
        })
        .eq('iid', student.iid)

      updated++
    }
    setStatus(`Updated ${updated} students`)
    setUpdating(false)
    loadStudents()
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }) }
    })
  }, [navigate])

  const sections = classVal ? sectionsByClass[classVal] ?? [] : []

  return (
    <PageShell title="Part 2 – Total & Average">
      {() => (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label>Class</label>
                <select value={classVal} onChange={e => { setClassVal(e.target.value); setSection(''); }} style={{ minWidth: '140px' }}>
                  <option value="">Select Class</option>
                  {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
                </select>
              </div>
              <div>
                <label>Section</label>
                <select value={section} onChange={e => setSection(e.target.value)} style={{ minWidth: '140px' }}>
                  <option value="">Select Section</option>
                  {sections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={loadStudents} disabled={loading}>
                {loading ? 'Loading…' : '📊 Load Students'}
              </button>
              <button className="btn btn-success" onClick={calculateTotals} disabled={updating || students.length === 0}>
                {updating ? 'Calculating…' : '➕ Calculate & Update Totals'}
              </button>
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '12px' }}>{status}</div>}
          </div>

          {students.length > 0 && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>IID</th>
                    <th>Student Name</th>
                    <th>Class</th>
                    <th>Section</th>
                    <th>Roll</th>
                    <th>Total Mark</th>
                    <th>Average</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.iid}>
                      <td>{i + 1}</td>
                      <td>{s.iid}</td>
                      <td>{s.student_name_en}</td>
                      <td>{s.class_2025}</td>
                      <td>{s.section_2025}</td>
                      <td>{s.roll_2025 ?? '—'}</td>
                      <td>{s.total_mark ?? '—'}</td>
                      <td>{s.average_mark ?? '—'}</td>
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
