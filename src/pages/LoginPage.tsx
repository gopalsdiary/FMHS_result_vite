import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
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
    if (remember) {
      localStorage.setItem('rememberedEmail', email)
    } else {
      localStorage.removeItem('rememberedEmail')
    }
    const redirect = sessionStorage.getItem('redirectUrl') || '/dashboard'
    sessionStorage.removeItem('redirectUrl')
    navigate(redirect, { replace: true })
  }

  return (
    <div style={styles.body}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <div style={styles.brandLogo}>📊</div>
          <div style={styles.brandTitle}>Result Processing System</div>
          <div style={styles.subtitle}>Admin Portal</div>
        </div>

        <h2 style={styles.title}>Sign In</h2>

        <form onSubmit={handleSubmit} noValidate>
          <div style={styles.formGroup}>
            <label htmlFor="email" style={styles.label}>Email Address</label>
            <input
              id="email"
              type="email"
              placeholder="name@school.edu"
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
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div style={styles.formActions}>
            <label style={styles.remember}>
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                style={{ width: 'auto', margin: 0, accentColor: '#e91e63' }}
              />
              Remember me
            </label>
            <a href="#" style={styles.forgot}>Forgot password?</a>
          </div>

          <button type="submit" disabled={loading} style={styles.primaryBtn}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {error && (
          <div role="alert" style={styles.errorBox}>{error}</div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    fontFamily: "'Inter','Segoe UI',sans-serif",
    background: 'radial-gradient(circle at 25% 25%, #e0f2fe 0%, #fce4ec 55%, #ffffff 100%)',
    margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
  },
  card: {
    background: 'linear-gradient(135deg,rgba(255,255,255,0.86),rgba(255,255,255,0.97))',
    backdropFilter: 'blur(28px) saturate(140%)',
    padding: '46px 44px 42px', borderRadius: '30px',
    boxShadow: '0 10px 28px -6px rgba(233,30,99,0.18),0 28px 60px -18px rgba(33,150,243,0.28)',
    width: '100%', maxWidth: '440px',
    border: '1px solid rgba(255,255,255,0.4)',
  },
  brand: { textAlign: 'center', marginBottom: '36px' },
  brandLogo: { fontSize: '48px', marginBottom: '8px' },
  brandTitle: {
    fontSize: '24px', fontWeight: 700,
    background: 'linear-gradient(135deg,#e91e63,#2196f3)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text',
    color: 'transparent', WebkitTextFillColor: 'transparent', marginBottom: '8px',
  },
  subtitle: { color: '#81c784', fontSize: '14px' },
  title: {
    fontSize: '29px', fontWeight: 800,
    background: 'linear-gradient(135deg,#e91e63,#2196f3)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text',
    color: 'transparent', WebkitTextFillColor: 'transparent',
    marginBottom: '30px', textAlign: 'center', letterSpacing: '0.5px',
  },
  formGroup: { marginBottom: '20px' },
  label: { display: 'block', marginBottom: '6px', fontWeight: 600, color: '#424242', fontSize: '14px' },
  input: {
    width: '100%', padding: '15px 18px',
    border: '2px solid #e1f5fe', borderRadius: '18px', fontSize: '16px',
    transition: 'all 0.35s', background: 'rgba(255,255,255,0.9)', fontWeight: 500,
  },
  passwordWrapper: { position: 'relative' },
  passwordToggle: {
    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
    background: 'linear-gradient(135deg,#e91e63,#2196f3)', border: 'none', cursor: 'pointer',
    fontSize: '15px', color: '#fff', width: '44px', height: '44px', borderRadius: '16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 10px rgba(233,30,99,0.35)',
  },
  formActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  remember: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#546e7a' },
  forgot: { color: '#2196f3', textDecoration: 'none', fontSize: '14px', fontWeight: 500 },
  primaryBtn: {
    width: '100%', padding: '19px', border: 'none', borderRadius: '22px',
    fontSize: '16px', fontWeight: 600, cursor: 'pointer',
    background: 'linear-gradient(135deg,#e91e63 10%,#2196f3 90%)', color: '#fff',
    boxShadow: '0 8px 24px -4px rgba(233,30,99,0.45)',
    transition: 'all 0.45s',
  },
  errorBox: {
    color: '#e91e63', marginTop: '20px', padding: '14px 18px',
    background: 'linear-gradient(120deg,rgba(233,30,99,0.12),rgba(33,150,243,0.08))',
    borderRadius: '16px', fontSize: '14px', textAlign: 'center',
    border: '1px solid rgba(233,30,99,0.25)', fontWeight: 500,
  },
}
