import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Network, FileText, BarChart2 } from 'lucide-react'
import { LegalFooter } from './LegalPages'

const FEATURES = [
  {
    Icon: Network,
    title: 'Visualise your org',
    body: 'Build interactive, draggable org charts that stay in sync as your company changes — not a slide that goes stale.',
  },
  {
    Icon: FileText,
    title: 'Living job descriptions',
    body: 'Attach a job description to every role and route it through draft → review → approved, with AI-assisted drafting.',
  },
  {
    Icon: BarChart2,
    title: 'Plan headcount',
    body: 'Map open roles, backfills, and new hires onto the chart and forecast headcount quarter by quarter.',
  },
]

export function LandingPage() {
  useEffect(() => { document.title = 'StratMap — Map your organisation. Build it deliberately.' }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        maxWidth: 1080, margin: '0 auto', padding: '20px 24px',
      }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand)', letterSpacing: '-.4px' }}>StratMap</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/pricing" style={{ fontSize: 14, color: 'var(--muted)', textDecoration: 'none' }}>Pricing</Link>
          <Link to="/sign-in" style={{ fontSize: 14, color: 'var(--text)', textDecoration: 'none' }}>Sign in</Link>
          <Link to="/sign-up" style={{
            fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none',
            background: 'var(--grad-brand)', padding: '9px 16px', borderRadius: 8,
          }}>Start free</Link>
        </div>
      </nav>

      {/* Hero */}
      <header style={{ maxWidth: 760, margin: '0 auto', padding: '72px 24px 56px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 46, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-1px', margin: 0 }}>
          Map your organisation.<br />Build it deliberately.
        </h1>
        <p style={{ fontSize: 18, color: 'var(--muted)', lineHeight: 1.6, margin: '20px auto 32px', maxWidth: 560 }}>
          The collaborative org chart and people-planning tool for founders, HR, and operations leaders.
          Treat your org as a living document — visualise it, staff it, and plan its growth.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/sign-up" style={{
            fontSize: 15, fontWeight: 600, color: '#fff', textDecoration: 'none',
            background: 'var(--grad-brand)', padding: '12px 24px', borderRadius: 10,
          }}>Start free</Link>
          <Link to="/dashboard" style={{
            fontSize: 15, fontWeight: 600, color: 'var(--text)', textDecoration: 'none',
            background: 'var(--surface)', border: '1px solid var(--border)', padding: '12px 24px', borderRadius: 10,
          }}>Go to app</Link>
        </div>
      </header>

      {/* Features */}
      <section style={{
        maxWidth: 1080, margin: '0 auto', padding: '0 24px 72px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20,
      }}>
        {FEATURES.map(({ Icon, title, body }) => (
          <div key={title} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: 24,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: 'var(--brand-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
            }}>
              <Icon size={20} color="var(--brand)" />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>{title}</h3>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{body}</p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px 48px' }}>
        <LegalFooter />
      </div>
    </div>
  )
}
