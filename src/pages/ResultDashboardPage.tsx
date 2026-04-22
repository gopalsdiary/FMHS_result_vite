import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { handleLogout } from '@/lib/authHelper'
import { TEACHER_DASHBOARD_PATH, isAdminEmail } from '@/lib/userAccess'
import type { User } from '@supabase/supabase-js'

interface DashboardCard {
  title: string
  desc: string
  href: string
  label: string
}

const cards: DashboardCard[] = [
  { title: 'Result Entry', desc: 'Enter and manage student results with dynamic grading for CQ, MCQ, and Practical', href: '/result-entry-admin', label: 'Result Entry' },
  { title: 'Grade Configuration', desc: 'Set grade boundaries, subject weights, and pass/fail criteria', href: '/grade-management', label: 'Configure Grades' },
  { title: 'Student Database', desc: 'Manage student information, view individual records and history', href: '/students', label: 'Manage Students' },
  { title: 'Summary (কে কতটি এন্ট্রি দিয়েছে)', desc: 'See how many entries have been made', href: '/summary', label: 'Total Entry Count' },
  { title: 'Subject Setup', desc: 'See subject & setup teacher for mark entry', href: '/subject-setup', label: 'Setup Teacher' },
  { title: 'Result View (Google Sheet)', desc: 'See subject result view', href: '/result-view', label: 'Result View' },
  { title: 'Teacher Subject View', desc: 'See Teacher subject result', href: '/subject-teacher', label: 'See Teachers Subject' },
  { title: 'Grade Management Server', desc: 'Grade entry management', href: '/grade-entry', label: 'Grade Entry' },
]

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: '🏠' },
  { label: 'Print Results', href: '/print-results', icon: '⚙️' },
  { label: 'Teacher Setup', href: '/teacher-setup', icon: '📚' },
  { label: 'Student Management', href: '/students', icon: '👥' },
  { label: 'Part 1 – Result Entry', href: '/result-entry-admin', icon: '⚙️' },
  { label: 'Part 2 – Total & Average', href: '/total-average', icon: '⚙️' },
  { label: 'Part 3 – Subject GPA', href: '/subject-gpa', icon: '⚙️' },
  { label: 'Part 4 – GPA Finalization', href: '/gpa-final', icon: '⚙️' },
  { label: 'Part 5 – Final Result View', href: '/result-list', icon: '⚙️' },
  { label: 'Part 6 – Pass-Fail Report', href: '/fail-report', icon: '⚙️' },
  { label: 'Part 7 – SMS', href: '/sms', icon: '⚙️' },
  { label: 'Teacher Option', href: '/teacher-dashboard', icon: '⚙️' },
  { label: 'Configuration', href: '/class-subject', icon: '⚙️' },
]

export default function ResultDashboardPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)

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
      }
    })
  }, [navigate])

  if (!user) return <div className="spinner" />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)' }}>

      {/* ── Always-visible sidebar ── */}
      <aside style={{
        width: '260px', flexShrink: 0,
        background: 'rgba(255,255,255,0.97)',
        boxShadow: '4px 0 20px rgba(0,0,0,0.12)',
        overflowY: 'auto',
        position: 'sticky', top: 0, height: '100vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Sidebar header */}
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid #e2e8f0',
          fontWeight: 800, fontSize: '1rem', color: '#ff7b00',
          letterSpacing: '0.01em',
        }}>
          📊 Result Processing System
        </div>
        {/* Nav links */}
        <nav style={{ padding: '8px 0', flex: 1 }}>
          {navItems.map(item => {
            const active = window.location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 20px', textDecoration: 'none',
                  fontSize: '13.5px', fontWeight: active ? 700 : 500,
                  color: active ? '#667eea' : '#64748b',
                  background: active ? '#f0f0ff' : 'transparent',
                  borderLeft: active ? '4px solid #667eea' : '4px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '16px' }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* ── Right side: header + main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        {/* Header */}
        <header className="app-header" style={{ position: 'sticky', top: 0, zIndex: 100 }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ff7b00' }}>
            📊 Dashboard Overview
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#64748b' }}>
            <span>👤 {user.email}</span>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 14px', fontSize: '13px' }}
              onClick={() => handleLogout('/dashboard')}
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Main content */}
        <main style={{ padding: '32px', flex: 1 }}>
        {/* Hero */}
        <div style={{
          background: '#f0f0f3', padding: '40px', borderRadius: '25px',
          marginBottom: '32px',
          boxShadow: '20px 20px 60px #bebebe,-20px -20px 60px #ffffff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px' }}>
            <div style={{
              background: '#f0f0f3', width: '60px', height: '60px', borderRadius: '20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '8px 8px 16px #bebebe,-8px -8px 16px #ffffff', fontSize: '28px',
            }}>📊</div>
            <div>
              <h2 style={{ margin: 0, fontSize: '2.2em', fontWeight: 800, color: '#2d3748' }}>
                Dashboard Overview (6-8 Class)
              </h2>
              <p style={{ margin: '8px 0 0', color: '#4a5568', fontSize: '1.1em', fontWeight: 500 }}>
                Real-time insights and analytics for your result processing system
              </p>
            </div>
          </div>
        </div>

        {/* Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
          gap: '24px',
        }}>
          {cards.map(card => (
            <div key={card.href} style={{
              background: '#f0f0f3', borderRadius: '25px',
              padding: '32px',
              boxShadow: '12px 12px 24px #bebebe,-12px -12px 24px #ffffff',
            }}>
              <div style={{ fontSize: '1.3em', fontWeight: 700, color: '#2d3748', marginBottom: '12px' }}>
                {card.title}
              </div>
              <div style={{ color: '#4a5568', marginBottom: '24px', lineHeight: '1.6' }}>
                {card.desc}
              </div>
              <Link
                to={card.href}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '8px',
                  background: '#0366d6', color: '#fff',
                  fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none',
                }}
              >
                {card.label}
              </Link>
            </div>
          ))}
        </div>
      </main>
      </div>  {/* end right-side column */}
    </div>
  )
}
