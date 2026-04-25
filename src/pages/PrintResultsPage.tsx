import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import { handleLogout } from '@/utils/authHelper'
import { loadExamAnn25Meta } from '@/services/examAnn25Meta'
import type { User } from '@supabase/supabase-js'

interface PrintStudent {
  iid: string
  student_name_en: string
  father_name_en?: string
  father_mobile?: string
  roll?: string | number
  section: string
  gpa_final?: number | null
  remark?: string | null
  class_rank?: number | null
  subjects?: SubjectMark[]
}

interface SubjectMark {
  subject: string
  cq?: number | null
  mcq?: number | null
  practical?: number | null
  total?: number | null
  gpa?: number | null
  absent?: boolean
}

export default function PrintResultsPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [classVal, setClassVal] = useState('')
  const [sectionVal, setSectionVal] = useState('')
  const [classOptions, setClassOptions] = useState<string[]>([])
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, string[]>>({})
  const [sortByRank, setSortByRank] = useState(false)
  const [students, setStudents] = useState<PrintStudent[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      setUser(user)
    })
    loadExamAnn25Meta().then(meta => {
      setClassOptions(meta.classes)
      setSectionsByClass(meta.sectionsByClass)
    })
  }, [navigate])

  const loadStudents = useCallback(async () => {
    if (!classVal || !sectionVal) { setStatus('Please select class and section'); return }
    setLoading(true); setStatus('Loading…')
    const { data, error } = await supabase
      .from('fmhs_exam_data')
      .select('iid, student_name_en, father_name_en, father_mobile, roll, section, gpa_final, remark, class_rank')
      .eq('class', classVal)
      .eq('section', sectionVal)
      .order('roll', { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    let list = (data ?? []) as PrintStudent[]
    if (sortByRank) list = [...list].sort((a, b) => (a.class_rank ?? 999) - (b.class_rank ?? 999))
    setStudents(list)
    setStatus(`Loaded ${list.length} students`)
    setLoading(false)
  }, [classVal, sectionVal, sortByRank])

  const sectionOptions = classVal ? sectionsByClass[classVal] ?? [] : []

  if (!user) return <div className="spinner" style={{ marginTop: '80px' }} />

  return (
    <div style={{ fontFamily: 'var(--font-family)', minHeight: '100vh', background: '#f8fafc' }}>
      <header style={{ background: '#0366d6', color: '#fff', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>🖨️ Print Results</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px' }}>
          <span>{user.email}</span>
          <button onClick={() => handleLogout()} className="btn" style={{ background: '#d73a49', color: '#fff', padding: '6px 12px', fontSize: '13px' }}>Logout</button>
          <button onClick={() => navigate('/dashboard')} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>← Dashboard</button>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '24px auto', padding: '0 16px' }}>
        {/* Controls */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
            <div>
              <label>Class</label>
              <select value={classVal} onChange={e => setClassVal(e.target.value)} style={{ minWidth: '120px' }}>
                <option value="">Select Class</option>
                {classOptions.map(c => <option key={c} value={c}>Class {c}</option>)}
              </select>
            </div>
            <div>
              <label>Section</label>
              <select value={sectionVal} onChange={e => setSectionVal(e.target.value)} style={{ minWidth: '120px' }}>
                <option value="">Select Section</option>
                {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
              <input type="checkbox" checked={sortByRank} onChange={e => setSortByRank(e.target.checked)} />
              Sort by Rank
            </label>
            <button className="btn btn-primary" onClick={loadStudents} disabled={loading}>
              {loading ? 'Loading…' : '📊 Load Students'}
            </button>
            {students.length > 0 && (
              <button className="btn btn-secondary no-print" onClick={() => window.print()}>🖨️ Print</button>
            )}
          </div>
          {status && <div style={{ marginTop: '10px', fontSize: '14px', color: '#555' }}>{status}</div>}
        </div>

        {/* Results table */}
        {students.length > 0 && (
          <div className="card table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Roll</th>
                  <th>IID</th>
                  <th>Student Name</th>
                  <th>Father Name</th>
                  <th>Section</th>
                  <th>Rank</th>
                  <th>GPA</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.iid}>
                    <td>{s.roll ?? '—'}</td>
                    <td>{s.iid}</td>
                    <td>{s.student_name_en}</td>
                    <td>{s.father_name_en ?? '—'}</td>
                    <td>{s.section}</td>
                    <td>{s.class_rank ?? '—'}</td>
                    <td>{s.gpa_final ?? '—'}</td>
                    <td>{s.remark ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

