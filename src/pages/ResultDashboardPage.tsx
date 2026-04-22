import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { handleLogout } from '@/lib/authHelper'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        sessionStorage.setItem('redirectUrl', '/dashboard')
        navigate('/login', { replace: true })
      } else {
        setUser(user)
      }
    })
  }, [navigate])

  // Close sidebar on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sidebarOpen && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSidebarOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [sidebarOpen])

  if (!user) return <div className="spinner" />

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)' }}>
      {/* Header */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{ background: 'none', border: 'none', fontSize: '1.5em', cursor: 'pointer' }}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ff7b00' }}>
            📊 Result Processing System
          </span>
        </div>
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

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        style={{
          position: 'fixed', top: '65px', left: 0, bottom: 0,
          width: '280px', background: 'rgba(255,255,255,0.97)',
          boxShadow: '4px 0 20px rgba(0,0,0,0.1)',
          overflowY: 'auto', zIndex: 200,
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease',
        }}
      >
        <nav style={{ padding: '16px 0' }}>
          {navItems.map(item => (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px 24px', color: '#64748b', textDecoration: 'none',
                fontSize: '14px', fontWeight: 500,
                borderLeft: item.href === '/dashboard' ? '4px solid #667eea' : '4px solid transparent',
              }}
            >
              <span>{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <main style={{ padding: '32px', minHeight: 'calc(100vh - 65px)' }}>
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
    </div>
  )
}
