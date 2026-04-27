import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import { handleLogout } from '@/utils/authHelper'
import { TEACHER_DASHBOARD_PATH, isAdminEmail } from '@/utils/userAccess'
import type { User } from '@supabase/supabase-js'

interface Exam {
  id: number
  exam_name: string
  year: number
  is_live: boolean
  teacher_entry_enabled: boolean
}

export default function ResultDashboardPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [newExamName, setNewExamName] = useState('')
  const [newExamYear, setNewExamYear] = useState(new Date().getFullYear().toString())
 
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        sessionStorage.setItem('redirectUrl', '/dashboard')
        navigate('/login', { replace: true })
      } else {
        if (!isAdminEmail(user.email ?? user.id ?? '')) {
          navigate(TEACHER_DASHBOARD_PATH, { replace: true })
          return
        }
        setUser(user)
        loadExams()
      }
    })
  }, [navigate])

  async function loadExams() {
    setLoading(true)
    const { data } = await supabase
      .from('FMHS_exams_names')
      .select('*')
      .order('year', { ascending: false })
      .order('created_at', { ascending: false })
    setExams(data || [])
    setLoading(false)
  }

  const filteredExams = exams.filter(e => 
    e.exam_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    e.year.toString().includes(searchTerm)
  )

  async function handleCreateExam(e: React.FormEvent) {
    e.preventDefault()
    if (!newExamName || !newExamYear) return
    
    const { error } = await supabase.from('FMHS_exams_names').insert([{ exam_name: newExamName, year: parseInt(newExamYear) }])
    if (error) {
      alert(error.message)
    } else {
      setShowModal(false)
      setNewExamName('')
      loadExams()
    }
  }

  async function deleteExam(e: React.MouseEvent, id: number, name: string) {
    e.preventDefault()
    e.stopPropagation()

    const { count } = await supabase.from('FMHS_exam_data').select('*', { count: 'exact', head: true }).eq('exam_id', id)
    if (count && count > 0) {
      alert(`❌ ডিলিট করা যাচ্ছে না!\n\n"${name}" পরীক্ষায় ${count} জন শিক্ষার্থীর ডাটা আছে।\nআগে সব ডাটা মুছে তারপর ডিলিট করুন।`)
      return
    }

    if (!confirm(`Are you sure you want to delete "${name}"?`)) return
    const { error } = await supabase.from('FMHS_exams_names').delete().eq('id', id)
    if (error) alert(error.message)
    else loadExams()
  }

  if (loading && !user) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f1f5f9',
      color: '#1e293b',
      fontFamily: "'Outfit', 'Inter', sans-serif"
    }}>
      {/* NAVIGATION */}
      <nav style={{
        padding: '16px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', background: '#4f46e5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '18px', color: '#fff' }}>F</div>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.5px', color: '#0f172a' }}>FMHS Result Portal</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700 }}>{user?.email}</div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Administrator</div>
          </div>
          <button onClick={() => handleLogout()} style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#ef4444', padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>LOGOUT</button>

        </div>
      </nav>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
        
        {/* WELCOME & STATS */}
        <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 900, margin: 0, color: '#0f172a' }}>Exam Command Center</h2>
            <p style={{ color: '#64748b', fontSize: '16px', marginTop: '8px' }}>Manage academic sessions, student imports, and result processing.</p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            style={{ 
              background: '#4f46e5', color: '#fff', 
              border: 'none', padding: '14px 28px', borderRadius: '14px', 
              fontWeight: 800, fontSize: '15px', cursor: 'pointer',
              boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.3)',
              transition: 'transform 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >+ CREATE NEW EXAM</button>
        </div>

        {/* SEARCH */}
        <div style={{ position: 'relative', marginBottom: '32px' }}>
          <span style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '20px' }}>🔍</span>
          <input 
            type="text" 
            placeholder="Search by exam name or year..." 
            style={{ 
              width: '100%', padding: '18px 20px 18px 56px', borderRadius: '20px', 
              background: '#fff', border: '1px solid #e2e8f0',
              color: '#0f172a', fontSize: '16px', outline: 'none',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* EXAM GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px' }}>
          {filteredExams.map(exam => (
            <Link to={`/exam-panel/${exam.id}`} key={exam.id} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ 
                padding: '32px', borderRadius: '28px', background: '#fff', 
                border: '1px solid #e2e8f0', transition: 'all 0.3s',
                position: 'relative', overflow: 'hidden',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-8px)'
                e.currentTarget.style.borderColor = '#4f46e5'
                e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.borderColor = '#e2e8f0'
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <span style={{ 
                    padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 900,
                    background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe'
                  }}>{exam.year} SESSION</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: exam.is_live ? '#059669' : '#64748b' }}>{exam.is_live ? 'LIVE' : 'CLOSED'}</span>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: exam.is_live ? '#10b981' : '#cbd5e1' }} />
                  </div>
                </div>

                <h3 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 12px 0', color: '#0f172a' }}>{exam.exam_name}</h3>
                <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '28px', lineHeight: '1.5' }}>Manage students, configure subjects, and process results for this session.</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                   <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, marginBottom: '4px' }}>PORTAL</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>{exam.is_live ? 'Online' : 'Offline'}</div>
                   </div>
                   <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, marginBottom: '4px' }}>ENTRY</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>{exam.teacher_entry_enabled ? 'Teachers' : 'Admins'}</div>
                   </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#4f46e5' }}>OPEN PANEL →</span>
                  <button 
                    onClick={(e) => deleteExam(e, exam.id, exam.exam_name)}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px', padding: '4px' }}
                  >🗑️</button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* CREATE EXAM MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '40px', borderRadius: '32px', width: '460px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '8px', color: '#0f172a' }}>New Exam Session</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '32px' }}>Create a fresh exam entry for the selected academic year.</p>
            
            <form onSubmit={handleCreateExam}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>EXAM NAME</label>
                <input 
                  className="form-control" 
                  style={{ borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', background: '#f8fafc' }} 
                  value={newExamName} 
                  onChange={e => setNewExamName(e.target.value)} 
                  placeholder="e.g. Annual Exam 2026" 
                  required 
                />
              </div>
              <div style={{ marginBottom: '40px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>ACADEMIC YEAR</label>
                <select 
                  className="form-control" 
                  style={{ borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', background: '#f8fafc' }} 
                  value={newExamYear} 
                  onChange={e => setNewExamYear(e.target.value)}
                >
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ flex: 2, padding: '16px', borderRadius: '16px', background: '#4f46e5', border: 'none', fontWeight: 800, color: '#fff' }}
                >INITIALIZE SESSION</button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowModal(false)}
                  style={{ flex: 1, padding: '16px', borderRadius: '16px', background: '#f1f5f9', border: 'none', fontWeight: 700, color: '#475569' }}
                >CANCEL</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
        &copy; 2026 Feni Model High School. FMHS Result Portal v2.0
      </footer>
    </div>
  )
}

