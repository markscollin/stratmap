import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Network, FileText, BarChart2, Upload, Move, Share2 } from 'lucide-react'
import { LegalFooter } from './LegalPages'
import { PublicNav } from '../components/layout/PublicNav'
import { DEFAULT_NEW_WORKSPACE_TRIAL_DAYS, PLAN_LIMITS, PLAN_PRICES } from '../lib/plans'
import { useIsPhone } from '../hooks/useMediaQuery'

// The public landing page (R-62). Honest copy only: no testimonials, logos or numbers we do not have, and no promise the product
// does not keep. A chart is kept current by people editing it, by uploading a newer export ("update from a file", R-77), or on Growth
// and up by a BambooHR connection (R-78, daily if switched on). Nothing else syncs, so never claim other HR systems.
// The pictures are the real app (made by `npm run make:landing-images`), with made-up names, and say so.

const FEATURES = [
  {
    Icon: Network,
    title: 'Visualise your org',
    body: 'Build an interactive org chart, import your people from a spreadsheet, invite your team, comment on roles and share a read-only link. Edit it in place as the team changes, and everyone with access sees the same chart.',
    badge: 'Free',
  },
  {
    Icon: FileText,
    title: 'Job descriptions that live on the chart',
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

const STEPS = [
  { Icon: Upload, title: 'Import or start from a template', body: 'Upload a CSV or Excel export from any HR system or spreadsheet, or pick a starter structure. When people join, leave or move, upload the newer export and review the changes before they apply, or on Growth connect BambooHR and sync daily.' },
  { Icon: Move, title: 'Arrange it', body: 'Drag roles, draw reporting lines, colour by department and mark open, planned and backfill roles.' },
  { Icon: Share2, title: 'Share and plan', body: 'Send a read-only link or embed it, then plan hires and their cost by quarter.' },
]

const free = PLAN_LIMITS.free
const FAQ = [
  {
    q: 'What does the free plan include?',
    a: `One chart with up to ${free.maxNodesPerChart} roles, ${free.seats} people in the workspace, import, export, comments and share links. Paid plans start at £${PLAN_PRICES.starter.monthly} a month.`,
  },
  {
    q: 'What happens when the trial ends?',
    a: `Every new workspace gets ${DEFAULT_NEW_WORKSPACE_TRIAL_DAYS} days of Growth without a card. Afterwards it moves to Free unless you upgrade. Nothing is deleted: if you have more charts than Free allows, they become view-only until you upgrade or tidy up.`,
  },
  {
    q: 'Can I get my data out?',
    a: 'Yes, on every plan. Owners and admins can download everything as JSON, every role as a CSV that imports straight back in, and each chart’s version history. Deleting a workspace can be undone for 30 days, then it is erased.',
  },
  {
    q: 'Who can see salaries and job descriptions?',
    a: 'Salary bands and hiring budgets are visible to owners and admins only. Everyone else gets a role you choose (editor, commenter or viewer), and a public link shows the chart without salaries, job descriptions or comments.',
  },
  {
    q: 'Where is my data kept?',
    a: 'In our database (hosted by Neon) behind the app (hosted by Vercel). The privacy policy lists every service that handles your data and exactly what each one receives.',
  },
]

const sectionTitle = { fontSize: 24, fontWeight: 800, letterSpacing: '-.4px', textAlign: 'center', margin: '0 0 28px' } as const

export function LandingPage() {
  useEffect(() => { document.title = 'StratMap — Map your organisation. Build it deliberately.' }, [])
  const isPhone = useIsPhone()
  // On a phone the picture scrolls sideways: start at its middle, where the top of the chart is.
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = frame.current
    if (!isPhone || !el) return
    const centre = () => { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2 }
    centre()
    const img = el.querySelector('img')
    img?.addEventListener('load', centre)
    return () => img?.removeEventListener('load', centre)
  }, [isPhone])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <PublicNav />

      {/* Hero */}
      <header style={{ maxWidth: 760, margin: '0 auto', padding: isPhone ? '48px 20px 32px' : '72px 24px 40px', textAlign: 'center' }}>
        <h1 style={{ fontSize: isPhone ? 34 : 46, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-1px', margin: 0 }}>
          Map your organisation.<br />Build it deliberately.
        </h1>
        <p style={{ fontSize: 18, color: 'var(--muted)', lineHeight: 1.6, margin: '20px auto 32px', maxWidth: 560 }}>
          The org chart and people-planning tool for founders, HR, and operations leaders:
          see your organisation as it is, staff it, and plan how it grows.
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

      {/* The product, as it looks (made from the real app; dark or light to match the page) */}
      <figure data-testid="landing-hero-image" style={{ maxWidth: 1080, margin: '0 auto 72px', padding: '0 20px' }}>
        {/* On a phone the whole chart would be too small to read: it keeps a readable width and scrolls sideways inside its frame */}
        <div
          ref={frame}
          {...(isPhone ? { tabIndex: 0, role: 'region', 'aria-label': 'Example chart, scroll sideways to see all of it' } : {})}
          style={{ border: '1px solid var(--border)', borderRadius: 16, overflowX: isPhone ? 'auto' : 'hidden', overflowY: 'hidden', boxShadow: 'var(--shadow)', background: 'var(--surface)' }}
        >
          {(['dark', 'light'] as const).map(theme => (
            <img
              key={theme}
              className={`theme-${theme}-only`}
              src={`/landing/chart-${theme}.png`}
              width={1833}
              height={477}
              alt="An example org chart in StratMap: a chief executive with four direct reports, their teams below them coloured by department, with open and planned roles marked."
              style={{ width: isPhone ? 820 : '100%', maxWidth: 'none', height: 'auto' }}
            />
          ))}
        </div>
        <figcaption style={{ fontSize: 12, color: 'var(--dim)', textAlign: 'center', marginTop: 10 }}>Example chart. The names are made up.</figcaption>
      </figure>

      {/* How it works */}
      <section aria-labelledby="how-it-works" style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px 72px' }}>
        <h2 id="how-it-works" style={sectionTitle}>How it works</h2>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {STEPS.map(({ Icon, title, body }, i) => (
            <li key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color="var(--brand)" aria-hidden />
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: '4px 0 6px' }}><span style={{ color: 'var(--muted)' }}>{i + 1}. </span>{title}</h3>
                <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section aria-label="Features" style={{
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
              <Icon size={20} color="var(--brand)" aria-hidden />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>{title}</h3>
            <span data-testid="feature-plan" style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--brand)', background: 'var(--brand-bg)', padding: '2px 8px', borderRadius: 20, marginBottom: 8 }}>{badge}</span>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{body}</p>
          </div>
        ))}
      </section>

      {/* Pricing teaser */}
      <section data-testid="pricing-teaser" style={{ maxWidth: 1080, margin: '0 auto 72px', padding: '0 24px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: isPhone ? 24 : 32, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ maxWidth: 620 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Free to start. Pay when you grow.</h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
              Free for one chart of up to {free.maxNodesPerChart} roles. Starter is £{PLAN_PRICES.starter.monthly} a month, Growth £{PLAN_PRICES.growth.monthly} and Scale £{PLAN_PRICES.scale.monthly},
              per workspace, not per person.
            </p>
          </div>
          <Link to="/pricing" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', textDecoration: 'none', background: 'var(--bg)', border: '1px solid var(--border)', padding: '10px 20px', borderRadius: 10, whiteSpace: 'nowrap' }}>
            See plans and pricing
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq" style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 72px' }}>
        <h2 id="faq" style={sectionTitle}>Questions</h2>
        {FAQ.map(({ q, a }) => (
          <details key={q} data-testid="faq-item" style={{ borderTop: '1px solid var(--border)', padding: '16px 0' }}>
            <summary style={{ fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{q}</summary>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: '10px 0 0' }}>
              {a}{q.startsWith('Where') && <> <Link to="/privacy" style={{ color: 'var(--brand)' }}>Read the privacy policy</Link>.</>}
            </p>
          </details>
        ))}
      </section>

      {/* Footer */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px 48px' }}>
        <LegalFooter />
      </div>
    </div>
  )
}
