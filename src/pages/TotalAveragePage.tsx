import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import PageShell from '@/components/PageShell'

interface Student {
  iid: string
  student_name_en: string
  section_2025: string
  roll_2025?: string | number
  total_mark?: number | null
  average_mark?: number | null
}

export default function TotalAveragePage() {
  const navigate = useNavigate()
  const [section, setSection] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [updating, setUpdating] = useState(false)

  const loadStudents = useCallback(async () => {
    if (!section) { setStatus('Please select a section'); return }
    setLoading(true); setStatus('Loading…')
    const { data, error } = await supabase
      .from('exam_ann25')
      .select('iid, student_name_en, section_2025, roll_2025, total_mark, average_mark')
      .eq('section_2025', section)
      .order('roll_2025', { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    setStudents((data ?? []) as Student[])
    setStatus(`Loaded ${data?.length ?? 0} students`)
    setLoading(false)
  }, [section])

  async function calculateTotals() {
    if (students.length === 0) return
    setUpdating(true); setStatus('Calculating totals…')
    let updated = 0
    for (const student of students) {
      const { data: marks } = await supabase
        .from('result_entry_2025')
        .select('total')
        .eq('IID', student.iid)

      if (!marks) continue
      const totalMark = marks.reduce((sum, m) => sum + (Number(m.total) || 0), 0)
      const avgMark = marks.length > 0 ? +(totalMark / marks.length).toFixed(2) : 0

      await supabase
        .from('exam_ann25')
        .update({ total_mark: totalMark, average_mark: avgMark })
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

  const sections = ['6A','6B','6C','7A','7B','7C','8A','8B','8C','9A','9B','10A','10B']

  return (
    <PageShell title="Part 2 – Total & Average">
      {() => (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
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
                    <th>Section</th>
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
                      <td>{s.section_2025}</td>
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
