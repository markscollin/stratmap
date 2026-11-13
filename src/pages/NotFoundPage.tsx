import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUserStore } from '../store/userStore'

/** Shown for any URL the app has no page for (R-15): a plain way back, instead of a blank screen. */
export function NotFoundPage() {
  const signedIn = useUserStore(s => s.isAuthenticated)
  useEffect(() => { document.title = 'Page not found — StratMap' }, [])
  const home = signedIn ? { to: '/dashboard', label: 'Go to your dashboard' } : { to: '/', label: 'Go to the home page' }
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', letterSpacing: '.08em', marginBottom: 12 }}>404</p>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Page not found</h1>
        <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 28 }}>
          There is nothing at this address. The link may be old or mistyped.
        </p>
        <Link
          to={home.to}
          style={{ display: 'inline-block', padding: '11px 24px', background: 'var(--grad-brand)', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
        >
          {home.label}
        </Link>
      </div>
    </main>
  )
}
