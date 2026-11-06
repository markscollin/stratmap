import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Upload, Sparkles } from 'lucide-react'
import { useChartStore } from '../../store/chartStore'
import { usePermission } from '../../hooks/usePermission'

/** What the Dashboard shows before the workspace has any chart: three ways to start instead of a wall of zeros (roadmap 2.7). */
export function DashboardEmpty() {
  const navigate = useNavigate()
  const { canEdit } = usePermission()
  const createSampleChart = useChartStore(s => s.createSampleChart)
  const [busy, setBusy] = useState(false)

  if (!canEdit) {
    return (
      <div data-testid="dashboard-empty" style={card}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No org charts yet</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          Nothing to show until someone with edit access creates a chart. Ask a workspace editor or admin.
        </p>
      </div>
    )
  }

  const options = [
    { id: 'new',    Icon: Plus,     title: 'Create a chart',      body: 'Start blank or from a template such as Startup or Hiring plan.', onClick: () => navigate('/charts?new=1') },
    { id: 'import', Icon: Upload,   title: 'Import your people',  body: 'Upload a CSV or Excel file. We build the reporting lines for you.', onClick: () => navigate('/charts?import=1') },
    {
      id: 'sample', Icon: Sparkles, title: 'Look at a sample',     body: 'A small example chart to click around in. Free, and easy to delete.',
      onClick: async () => { setBusy(true); const c = await createSampleChart(); setBusy(false); if (c) navigate(`/charts/${c.id}`) },
    },
  ]

  return (
    <div data-testid="dashboard-empty" style={card}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.3px', marginBottom: 6 }}>Your org starts here</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>
        Org health, open roles and headcount appear here once you have a chart. Pick a way to begin:
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        {options.map(({ id, Icon, title, body, onClick }) => (
          <button
            key={id}
            data-testid={`dashboard-empty-${id}`}
            disabled={busy}
            onClick={onClick}
            style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px', background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 12, cursor: busy ? 'wait' : 'pointer', color: 'var(--text)' }}
          >
            <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={16} color="var(--brand)" />
            </span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{body}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 26, boxShadow: 'var(--shadow-sm)',
}
