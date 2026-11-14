import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Network, FileText, BarChart2 } from 'lucide-react'
import { LegalFooter } from './LegalPages'
import { PublicNav } from '../components/layout/PublicNav'
import { DEFAULT_NEW_WORKSPACE_TRIAL_DAYS } from '../lib/plans'

const FEATURES = [
  {
    Icon: Network,
    title: 'Visualise your org',
    body: 'Build interactive, draggable org charts, import your people from a spreadsheet, invite your team, comment on roles and share a read-only link. One living chart, not a slide that goes stale.',
    badge: 'Free',
  },
  {
    Icon: FileText,
    title: 'Living job descriptions',
    body: 'Attach a job description to every role and route it through draft → review → approved, with AI-assisted drafting.',
    badge: 'Starter and up',
  },
  {
    Icon: BarChart2,
    title: 'Plan headcount',
    body: 'Map open roles, backfills, and new hires onto the chart, budget them quarter by quarter, and keep version history to compare scenarios.',
    badge: 'Growth',
  },
]

export function LandingPage() {
  useEffect(() => { document.title = 'StratMap — Map your organisation. Build it deliberately.' }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <PublicNav />

      {/* Hero */}
      <header style={{ maxWidth: 760, margin: '0 auto', padding: '72px 24px 56px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 46, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-1px', margin: 0 }}>
          Map your organisation.<br />Build it deliberately.
        </h1>
        <p style={{ fontSize: 18, color: 'var(--muted)', lineHeight: 1.6, margin: '20px auto 32px', maxWidth: 560 }}>
          The org chart and people-planning tool for founders, HR, and operations leaders.
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
        <p style={{ fontSize: 13, color: 'var(--dim)', margin: '16px 0 0' }}>
          Every new workspace starts with {DEFAULT_NEW_WORKSPACE_TRIAL_DAYS} days of Growth. No card needed.
        </p>
      </header>

      {/* Features */}
      <section style={{
        maxWidth: 1080, margin: '0 auto', padding: '0 24px 72px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20,
      }}>
        {FEATURES.map(({ Icon, title, body, badge }) => (
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
            <span data-testid="feature-plan" style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--brand)', background: 'var(--brand-bg)', padding: '2px 8px', borderRadius: 20, marginBottom: 8 }}>{badge}</span>
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
