import { Link } from 'react-router-dom'

/** Top bar for the public marketing pages (landing, pricing): wordmark, Pricing, Sign in, Start free. */
export function PublicNav() {
  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      maxWidth: 1080, margin: '0 auto', padding: '20px 24px',
    }}>
      <Link to="/" style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand)', letterSpacing: '-.4px', textDecoration: 'none' }}>StratMap</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link to="/pricing" style={{ fontSize: 14, color: 'var(--muted)', textDecoration: 'none' }}>Pricing</Link>
        <Link to="/sign-in" style={{ fontSize: 14, color: 'var(--text)', textDecoration: 'none' }}>Sign in</Link>
        <Link to="/sign-up" style={{
          fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none',
          background: 'var(--grad-brand)', padding: '9px 16px', borderRadius: 8,
        }}>Start free</Link>
      </div>
    </nav>
  )
}
