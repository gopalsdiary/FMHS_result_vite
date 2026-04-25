import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

interface DetectedSubject { name: string; hasCQ: boolean; hasMCQ: boolean; hasPractical: boolean; hasTotal: boolean; hasGPA: boolean }

export default function SubjectSetupPage() {
  const navigate = useNavigate()
  const [subjects, setSubjects] = useState<DetectedSubject[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      detectSubjects()
    })
  }, [navigate])

  async function detectSubjects() {
    setLoading(true)
    const { data, error } = await supabase.from('fmhs_exam_data').select('*').limit(1)
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    if (!data?.length) { setStatus('No data found in fmhs_exam_data'); setLoading(false); return }

    const keys = Object.keys(data[0])
    const map = new Map<string, DetectedSubject>()
    keys.forEach(k => {
      const m = k.match(/^\*?(.+?)_(CQ|MCQ|Practical|Total|GPA)$/i)
      if (m) {
        const name = m[1].trim()
        const comp = m[2].toUpperCase()
        if (!map.has(name)) map.set(name, { name, hasCQ: false, hasMCQ: false, hasPractical: false, hasTotal: false, hasGPA: false })
        const s = map.get(name)!
        if (comp === 'CQ') s.hasCQ = true
        else if (comp === 'MCQ') s.hasMCQ = true
        else if (comp === 'PRACTICAL') s.hasPractical = true
        else if (comp === 'TOTAL') s.hasTotal = true
        else if (comp === 'GPA') s.hasGPA = true
      }
    })
    setSubjects(Array.from(map.values()))
    setLoading(false)
  }

  return (
    <PageShell title="Subject Setup (Read-Only)">
      {() => (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: '16px', background: '#fff8e1', border: '1px solid #f9a825' }}>
            <p style={{ margin: 0, fontSize: '14px', color: '#5d4037' }}>
              ℹ️ Subject columns are auto-detected from the <strong>fmhs_exam_data</strong> table. Columns follow the pattern <code>*SubjectName_CQ</code>, <code>*SubjectName_MCQ</code>, etc. To add or remove subjects, update the database schema via SQL.
            </p>
          </div>

          {status && <div className="alert alert-info">{status}</div>}
          {loading && <div className="spinner" />}

          {!loading && subjects.length > 0 && (
            <div className="card table-responsive">
              <div style={{ fontWeight: 600, marginBottom: '12px', fontSize: '15px' }}>
                Detected Subjects ({subjects.length})
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Subject Name</th>
                    <th style={{ textAlign: 'center' }}>CQ</th>
                    <th style={{ textAlign: 'center' }}>MCQ</th>
                    <th style={{ textAlign: 'center' }}>Practical</th>
                    <th style={{ textAlign: 'center' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>GPA</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s, i) => (
                    <tr key={s.name}>
                      <td style={{ color: '#6a737d', fontSize: '12px' }}>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td style={{ textAlign: 'center' }}>{s.hasCQ ? <span style={{ color: '#1a7f37' }}>✅</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ textAlign: 'center' }}>{s.hasMCQ ? <span style={{ color: '#1a7f37' }}>✅</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ textAlign: 'center' }}>{s.hasPractical ? <span style={{ color: '#1a7f37' }}>✅</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ textAlign: 'center' }}>{s.hasTotal ? <span style={{ color: '#0366d6' }}>✅</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ textAlign: 'center' }}>{s.hasGPA ? <span style={{ color: '#0366d6' }}>✅</span> : <span style={{ color: '#ccc' }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && subjects.length === 0 && !status && (
            <div className="card" style={{ textAlign: 'center', color: '#6a737d', padding: '40px' }}>
              No subject columns detected in fmhs_exam_data.
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}

