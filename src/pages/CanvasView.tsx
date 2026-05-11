import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useChartStore } from '../store'
import { StatusBadge } from '../components/ui/StatusBadge'
import { VersionPill } from '../components/ui/VersionPill'
import { OrgChart } from '../features/canvas/OrgChart'

export function CanvasView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { charts } = useChartStore()

  const chart = charts.find(c => c.id === id)
  if (!chart) return (
    <div style={{ padding: 40, color: 'var(--text)' }}>
      <p>Chart not found.</p>
      <button onClick={() => navigate('/charts')} style={{ marginTop: 12, color: 'var(--brand)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
        ← Back to library
      </button>
    </div>
  )

  return (
    <div style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top-left: back + chart meta */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => navigate('/charts')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}
        >
          <ChevronLeft size={13} /> All charts
        </button>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', boxShadow: 'var(--shadow-sm)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{chart.name}</span>
        </div>
        <StatusBadge status={chart.status} />
        <VersionPill version={chart.version} />
      </div>

      <OrgChart initialNodes={chart.nodes} initialEdges={chart.edges} />
    </div>
  )
}
