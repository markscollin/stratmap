import { RefreshCw } from 'lucide-react'
import { useChartConflict } from '../../lib/chartRevision'

/**
 * Shown when the server refused an edit because the chart was changed elsewhere
 * (another tab or person, roadmap 2.4). The canvas goes read-only until reloaded,
 * so nobody keeps editing a stale copy.
 */
export function ChartConflictBanner({ chartId, onReload, flow = false }: { chartId: string; onReload: () => void; flow?: boolean }) {
  const conflictId = useChartConflict(s => s.chartId)
  if (conflictId !== chartId) return null
  return (
    <div
      role="alert"
      data-export-ignore
      style={{
        ...(flow
          ? { flexShrink: 0, borderRadius: 0, borderWidth: '0 0 1px 0' }
          : { position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 40, maxWidth: 'calc(100% - 32px)', borderRadius: 10, boxShadow: 'var(--shadow-sm)' }),
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 16px', background: 'var(--warn-bg)', border: '1px solid var(--warn)',
        color: 'var(--text)', fontSize: 13,
      }}
    >
      <span>
        <strong>This chart was changed elsewhere.</strong> Your last edit was not saved. Reload to see the latest version.
      </span>
      <button
        onClick={onReload}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
          fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          background: 'var(--brand)', color: '#fff', border: 'none',
        }}
      >
        <RefreshCw size={13} /> Reload
      </button>
    </div>
  )
}
