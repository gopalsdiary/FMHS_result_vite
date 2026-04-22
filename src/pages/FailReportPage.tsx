import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import PageShell from '@/components/PageShell'

const SECTIONS = ['6A','6B','6C','7A','7B','7C','8A','8B','8C','9A','9B','10A','10B']

interface FailStudent { iid: string; student_name_en: string; roll_2025: string | number; gpa_final: string | number | null; subjects: string[] }

export default function FailReportPage() {
  const navigate = useNavigate()
  const [section, setSection] = useState('')
  const [students, setStudents] = useState<FailStudent[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) navigate('/login', { replace: true })
    })
  }, [navigate])

  const loadReport = useCallback(async () => {
    if (!section) { setStatus('Please select a section'); return }
    setLoading(true); setStatus('Loading…')

    const { data, error } = await supabase
      .from('exam_ann25')
      .select('iid, student_name_en, roll_2025, gpa_final')
      .eq('section_2025', section)
      .order('roll_2025', { ascending: true })

    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    const fails = ((data ?? []) as FailStudent[]).filter(s => s.gpa_final === 'F' || s.gpa_final === 0)
    setStudents(fails)
    setStatus(`${fails.length} failed student(s) in section ${section}`)
    setLoading(false)
  }, [section])

  return (
    <PageShell title="Part 6 – Fail Report">
      {() => (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label>Section</label>
                <select value={section} onChange={e => setSection(e.target.value)} style={{ minWidth: '140px' }}>
                  <option value="">Select Section</option>
                  {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={loadReport} disabled={loading}>
                {loading ? 'Loading…' : '🔍 Generate Report'}
              </button>
              <button className="btn btn-secondary" onClick={() => window.print()}>🖨️ Print</button>
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '10px' }}>{status}</div>}
          </div>

          {loading && <div className="spinner" />}

          {!loading && students.length > 0 && (
            <div className="card table-responsive">
              <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '12px', textAlign: 'center', color: '#d73a49' }}>
                Fail Student Report — Section {section}
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>IID</th>
                    <th>Student Name</th>
                    <th>Roll</th>
                    <th>GPA Final</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.iid} style={{ background: '#fff5f5' }}>
                      <td>{i + 1}</td>
                      <td>{s.iid}</td>
                      <td style={{ fontWeight: 600 }}>{s.student_name_en}</td>
                      <td>{s.roll_2025 ?? '—'}</td>
                      <td style={{ fontWeight: 700, color: '#d73a49' }}>{String(s.gpa_final ?? 'F')}</td>
                      <td style={{ color: '#d73a49', fontWeight: 600 }}>FAIL</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && students.length === 0 && section && (
            <div className="alert alert-info" style={{ textAlign: 'center', padding: '32px' }}>
              ✅ No failed students in section {section}
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
