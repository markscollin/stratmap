import { RefreshCw } from 'lucide-react'
import { useChartConflict } from '../../lib/chartRevision'

/**
 * Shown when the server refused an edit because the chart was changed elsewhere
 * (another tab or person, roadmap 2.4). The canvas goes read-only until reloaded,
 * so nobody keeps editing a stale copy.
 */
export function ChartConflictBanner({ chartId, onReload }: { chartId: string; onReload: () => void }) {
  const conflictId = useChartConflict(s => s.chartId)
  if (conflictId !== chartId) return null
  return (
    <div
      role="alert"
      data-export-ignore
      style={{
        position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', maxWidth: 'calc(100% - 32px)',
        padding: '10px 16px', background: 'var(--warn-bg)', border: '1px solid var(--warn)',
        borderRadius: 10, color: 'var(--text)', fontSize: 13, boxShadow: 'var(--shadow-sm)',
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
