import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import { handleLogout } from '@/utils/authHelper'

interface Assignment {
  subject_code: number
  exam_id: number
  class: number
  section: string
  subject_name: string
  teacher_name_en: string
  exams: { exam_name: string; year: number; is_live: boolean; teacher_entry_enabled: boolean }
}

export default function TeacherDashboardPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    loadAssignments()
  }, [])

  async function loadAssignments() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }
    setUserEmail(user.email ?? '')

    const { data, error } = await supabase
      .from('FMHS_exam_teacher_selection')
      .select('*, exams:FMHS_exams_names(exam_name, year, is_live, teacher_entry_enabled)')
      .eq('teacher_email_id', user.email)
      .not('exam_id', 'is', null)
    
    if (error) console.error(error)
    else setAssignments(data as any[])
    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#1e293b', fontFamily: "'Outfit', sans-serif" }}>
      {/* HEADER */}
      <header style={{ background: '#fff', padding: '16px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', background: '#ec4899', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900 }}>T</div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>Teacher Portal</h1>
            <p style={{ margin: 0, fontSize: '10px', color: '#ec4899', fontWeight: 800 }}>FENI MODEL HIGH SCHOOL</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ textAlign: 'right' }}>
             <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{userEmail}</div>
             <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Active Instructor</div>
          </div>
          <button onClick={() => handleLogout()} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#64748b', padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>LOGOUT</button>

        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 20px' }}>
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>Class Assignments</h2>
          <p style={{ color: '#64748b', fontSize: '16px', marginTop: '8px' }}>Select an active exam session to start entering student grades.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
          {assignments.map(a => (
            <Link key={a.subject_code} to={`/teacher-entry/${a.exam_id}/${a.subject_code}`} style={{ textDecoration: 'none' }}>
              <div style={{ 
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '28px', padding: '32px',
                transition: 'all 0.3s', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-6px)'
                e.currentTarget.style.borderColor = '#ec4899'
                e.currentTarget.style.boxShadow = '0 15px 30px rgba(236,72,153,0.1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.borderColor = '#e2e8f0'
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)'
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                   <span style={{ padding: '4px 12px', background: '#fdf2f8', color: '#db2777', borderRadius: '8px', fontSize: '11px', fontWeight: 900, border: '1px solid #fbcfe8' }}>{a.exams.year} SESSION</span>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: a.exams.is_live ? '#059669' : '#64748b' }}>{a.exams.is_live ? 'LIVE' : 'CLOSED'}</span>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: a.exams.is_live ? '#10b981' : '#cbd5e1' }} />
                   </div>
                </div>

                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{a.exams.exam_name}</h3>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#ec4899', marginBottom: '20px' }}>{a.subject_name}</div>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ flex: 1, background: '#f8fafc', padding: '12px', borderRadius: '16px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>CLASS</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#1e293b' }}>{a.class}</div>
                  </div>
                  <div style={{ flex: 1, background: '#f8fafc', padding: '12px', borderRadius: '16px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>SECTION</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#1e293b' }}>{a.section}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span style={{ fontSize: '13px', fontWeight: 800, color: '#ec4899' }}>ENTER MARKS →</span>
                   {!a.exams.teacher_entry_enabled && <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700 }}>Entry Locked</span>}
                </div>
              </div>
            </Link>
          ))}
          {assignments.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '80px', background: '#fff', borderRadius: '32px', border: '2px dashed #e2e8f0' }}>
               <div style={{ fontSize: '50px', marginBottom: '20px' }}>📋</div>
               <h3 style={{ color: '#0f172a', fontWeight: 800 }}>No classes assigned</h3>
               <p style={{ color: '#64748b' }}>Please contact the administrator to assign subjects to your account.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

