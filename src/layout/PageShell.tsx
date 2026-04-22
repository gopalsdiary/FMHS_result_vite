import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import { handleLogout } from '@/utils/authHelper'
import { ADMIN_DASHBOARD_PATH, TEACHER_DASHBOARD_PATH, isAdminEmail } from '@/utils/userAccess'
import type { User } from '@supabase/supabase-js'

interface PageShellProps {
  title: string
  children: (user: User) => ReactNode
  loginPath?: string
  backHref?: string
  headerColor?: string
  requiredRole?: 'admin' | 'teacher' | 'any'
}

/**
 * Reusable shell that guards auth and renders a consistent page header.
 * The children render prop receives the authenticated User object.
 */
export default function PageShell({
  title,
  children,
  loginPath = '/login',
  backHref = '/dashboard',
  headerColor = '#0366d6',
  requiredRole = 'admin',
}: PageShellProps) {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        sessionStorage.setItem('redirectUrl', window.location.pathname)
        navigate(loginPath, { replace: true })
      } else {
        const admin = isAdminEmail(user.email ?? user.id ?? '')
        if (requiredRole === 'admin' && !admin) {
          navigate(TEACHER_DASHBOARD_PATH, { replace: true })
          setChecking(false)
          return
        }
        if (requiredRole === 'teacher' && admin) {
          navigate(ADMIN_DASHBOARD_PATH, { replace: true })
          setChecking(false)
          return
        }
        setUser(user)
      }
      setChecking(false)
    })
  }, [navigate, loginPath, requiredRole])

  if (checking || !user) return <div className="spinner" style={{ marginTop: '80px' }} />

  return (
    <div style={{ fontFamily: 'var(--font-family)', minHeight: '100vh', background: '#f8fafc' }}>
      <header style={{
        background: headerColor, color: '#fff', padding: '12px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            to={backHref}
            style={{ color: 'rgba(255,255,255,0.85)', textDecoration: 'none', fontSize: '13px', padding: '4px 10px', background: 'rgba(255,255,255,0.15)', borderRadius: '4px' }}
          >
            ← Back
          </Link>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{title}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }}>
          <span>👤 {user.email}</span>
          <button
            onClick={() => handleLogout(undefined, loginPath)}
            style={{ background: '#d73a49', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
          >
            Logout
          </button>
        </div>
      </header>
      <main style={{ padding: '24px', maxWidth: '100%' }}>
        {children(user)}
      </main>
    </div>
  )
}
