import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { handleLogout } from '@/lib/authHelper'
import { ADMIN_DASHBOARD_PATH, TEACHER_LOGIN_PATH, isAdminEmail } from '@/lib/userAccess'
import type { User } from '@supabase/supabase-js'

interface AssignedSubject {
  class: string
  section: string
  subject_name: string
}

export default function TeacherDashboardPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [subjects, setSubjects] = useState<AssignedSubject[]>([])
  const [loading, setLoading] = useState(true)
  const [subjectsLoading, setSubjectsLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        sessionStorage.setItem('redirectUrl', '/teacher-dashboard')
        navigate(TEACHER_LOGIN_PATH, { replace: true })
      } else {
        if (isAdminEmail(user.email ?? user.id ?? '')) {
          navigate(ADMIN_DASHBOARD_PATH, { replace: true })
          setLoading(false)
          return
        }
        setUser(user)
        loadAssignedSubjects(user.email ?? '')
      }
      setLoading(false)
    })
  }, [navigate])

  async function loadAssignedSubjects(email: string) {
    setSubjectsLoading(true)
    const { data, error } = await supabase
      .from('subject_selection')
      .select('class, section, subject_name')
      .eq('teacher_email_id', email)
      .order('class', { ascending: true })
      .order('section', { ascending: true })
      .order('subject_name', { ascending: true })

    if (!error && data) setSubjects(data as AssignedSubject[])
    setSubjectsLoading(false)
  }

  if (loading) return <div className="spinner" style={{ marginTop: '80px' }} />

  if (!user) return null

  return (
    <div style={{ background: '#f6f8fa', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg,#0366d6 0%,#024c9e 100%)',
        color: '#fff', padding: '12px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>📊 Result Processing System</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px' }}>
          <span>👤 {user.email}</span>
          <button
            onClick={() => handleLogout('/teacher-dashboard', TEACHER_LOGIN_PATH)}
            style={{
              background: '#d73a49', color: '#fff', border: 'none',
              padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
            }}
          >
            🚪 Logout
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Welcome */}
        <div style={{
          background: '#fff', border: '1px solid #d0d7de', borderRadius: '8px',
          padding: '24px', marginBottom: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <h2 style={{ fontSize: '22px', marginBottom: '8px', color: '#24292f' }}>
            Hello Teacher — Result Entry time: 25 October to 21 December
          </h2>
          <p style={{ color: '#6a737d', margin: 0 }}>
            Welcome back, <strong>{user.email}</strong>! Manage your result processing tasks efficiently.
          </p>
        </div>

        {/* Cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '20px', marginBottom: '24px' }}>
          {/* Result Entry */}
          <div style={{
            background: '#fff', border: '1px solid #d0d7de', borderRadius: '8px',
            padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{
                background: 'linear-gradient(135deg,#0366d6,#024c9e)',
                width: '40px', height: '40px', borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
              }}>📝</div>
              <div style={{ fontWeight: 600, fontSize: '16px', color: '#24292f' }}>Result Entry</div>
            </div>
            <p style={{ color: '#6a737d', fontSize: '14px', marginBottom: '16px', lineHeight: 1.5 }}>
              Enter and manage student exam results. Add marks for CQ, MCQ, and Practical components.
            </p>
            <Link
              to="/result-entry"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 16px', background: '#0366d6', color: '#fff',
                borderRadius: '6px', fontSize: '14px', fontWeight: 500, textDecoration: 'none',
              }}
            >
              ✏️ Enter Results
            </Link>
          </div>

          {/* Admin Dashboard link */}
          <div style={{
            background: '#fff', border: '1px solid #d0d7de', borderRadius: '8px',
            padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{
                background: 'linear-gradient(135deg,#1a7f37,#0f5132)',
                width: '40px', height: '40px', borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
              }}>🏠</div>
              <div style={{ fontWeight: 600, fontSize: '16px', color: '#24292f' }}>Admin Dashboard</div>
            </div>
            <p style={{ color: '#6a737d', fontSize: '14px', marginBottom: '16px', lineHeight: 1.5 }}>
              Go to the main admin dashboard for full system control.
            </p>
            <Link
              to="/dashboard"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 16px', background: '#1a7f37', color: '#fff',
                borderRadius: '6px', fontSize: '14px', fontWeight: 500, textDecoration: 'none',
              }}
            >
              🏠 Admin Dashboard
            </Link>
          </div>
        </div>

        {/* Assigned Subjects */}
        <div style={{
          background: '#fff', border: '1px solid #d0d7de', borderRadius: '8px',
          padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{
              background: 'linear-gradient(135deg,#0366d6,#024c9e)',
              width: '40px', height: '40px', borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
            }}>📚</div>
            <div style={{ fontWeight: 600, fontSize: '16px', color: '#24292f' }}>Your Assigned Subjects</div>
          </div>
          <p style={{ color: '#6a737d', fontSize: '14px', marginBottom: '16px' }}>
            Subjects assigned to you for result entry
          </p>

          {subjectsLoading && <div className="spinner" />}

          {!subjectsLoading && subjects.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#6a737d', fontSize: '14px' }}>
              No subjects assigned yet. Please contact administrator.
            </div>
          )}

          {!subjectsLoading && subjects.length > 0 && (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Class', 'Section', 'Subject'].map(h => (
                      <th key={h} style={{
                        padding: '12px', textAlign: 'left',
                        borderBottom: '1px solid #d0d7de',
                        background: '#f6f8fa', fontSize: '14px', fontWeight: 600,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{s.class}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{s.section}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{s.subject_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
