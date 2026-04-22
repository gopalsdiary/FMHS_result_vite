import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getPostLoginRedirect } from '@/lib/userAccess'

/** Teacher login — same Supabase auth, different redirect target. */
export default function LoginTeacherPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email || !password) {
      setError('Please enter both email and password')
      return
    }
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) {
      setError(authError.message || 'Sign in failed')
      return
    }
    const redirect = getPostLoginRedirect(email, sessionStorage.getItem('redirectUrl'))
    sessionStorage.removeItem('redirectUrl')
    navigate(redirect, { replace: true })
  }

  return (
    <div style={styles.body}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <div style={styles.brandLogo}>👩‍🏫</div>
          <div style={styles.brandTitle}>Result Processing System</div>
          <div style={styles.subtitle}>Teacher Portal</div>
        </div>

        <h2 style={styles.title}>Teacher Sign In</h2>

        <form onSubmit={handleSubmit} noValidate>
          <div style={styles.formGroup}>
            <label htmlFor="email" style={styles.label}>Email Address</label>
            <input
              id="email"
              type="email"
              placeholder="teacher@school.edu"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="password" style={styles.label}>Password</label>
            <div style={styles.passwordWrapper}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ ...styles.input, paddingRight: '60px' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                style={styles.passwordToggle}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} style={styles.primaryBtn}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {error && <div role="alert" style={styles.errorBox}>{error}</div>}

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#546e7a' }}>
          Admin?{' '}
          <a href="/login" style={{ color: '#2196f3', fontWeight: 500 }}>Admin Login</a>
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    fontFamily: "'Inter','Segoe UI',sans-serif",
    background: 'radial-gradient(circle at 75% 25%, #e8f5e9 0%, #e3f2fd 55%, #ffffff 100%)',
    margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
  },
  card: {
    background: 'linear-gradient(135deg,rgba(255,255,255,0.86),rgba(255,255,255,0.97))',
    backdropFilter: 'blur(28px) saturate(140%)',
    padding: '46px 44px 42px', borderRadius: '30px',
    boxShadow: '0 10px 28px -6px rgba(33,150,243,0.18),0 28px 60px -18px rgba(16,185,129,0.22)',
    width: '100%', maxWidth: '440px', border: '1px solid rgba(255,255,255,0.4)',
  },
  brand: { textAlign: 'center', marginBottom: '36px' },
  brandLogo: { fontSize: '48px', marginBottom: '8px' },
  brandTitle: {
    fontSize: '24px', fontWeight: 700,
    background: 'linear-gradient(135deg,#2196f3,#10b981)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text',
    color: 'transparent', WebkitTextFillColor: 'transparent', marginBottom: '8px',
  },
  subtitle: { color: '#81c784', fontSize: '14px' },
  title: {
    fontSize: '29px', fontWeight: 800,
    background: 'linear-gradient(135deg,#2196f3,#10b981)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text',
    color: 'transparent', WebkitTextFillColor: 'transparent',
    marginBottom: '30px', textAlign: 'center',
  },
  formGroup: { marginBottom: '20px' },
  label: { display: 'block', marginBottom: '6px', fontWeight: 600, color: '#424242', fontSize: '14px' },
  input: {
    width: '100%', padding: '15px 18px',
    border: '2px solid #e1f5fe', borderRadius: '18px', fontSize: '16px',
    background: 'rgba(255,255,255,0.9)', fontWeight: 500,
  },
  passwordWrapper: { position: 'relative' },
  passwordToggle: {
    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
    background: 'linear-gradient(135deg,#2196f3,#10b981)', border: 'none', cursor: 'pointer',
    fontSize: '15px', color: '#fff', width: '44px', height: '44px', borderRadius: '16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  primaryBtn: {
    width: '100%', padding: '19px', border: 'none', borderRadius: '22px',
    fontSize: '16px', fontWeight: 600, cursor: 'pointer',
    background: 'linear-gradient(135deg,#2196f3 10%,#10b981 90%)', color: '#fff',
  },
  errorBox: {
    color: '#1976d2', marginTop: '20px', padding: '14px 18px',
    background: 'rgba(33,150,243,0.08)', borderRadius: '16px',
    fontSize: '14px', textAlign: 'center', border: '1px solid rgba(33,150,243,0.25)',
  },
}
