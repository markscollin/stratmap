import { RefreshCw, RotateCw } from 'lucide-react'
import { useCanvasSave, retrySave } from './canvasSync'

/**
 * Shown when a canvas change could not be saved (launch review R-01). The canvas is read-only while it
 * shows, so nobody keeps editing a chart that is not being saved. Retry sends the failed change again
 * (only offered when it can succeed); Reload discards the unsaved change and loads what the server has.
 * A "changed elsewhere" failure is explained by ChartConflictBanner instead.
 */
export function SaveErrorBanner({ chartId, onReload, flow = false }: { chartId: string; onReload: () => void; flow?: boolean }) {
  const failure = useCanvasSave(s => s.failure)
  if (!failure || failure.chartId !== chartId || failure.conflict) return null
  const button = (primary: boolean) => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
    fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const,
    background: primary ? 'var(--brand)' : 'transparent', color: primary ? '#fff' : 'var(--text)',
    border: primary ? 'none' : '1px solid var(--border)',
  })
  return (
    <div
      role="alert"
      data-export-ignore
      style={{
        ...(flow
          ? { flexShrink: 0, borderRadius: 0, borderWidth: '0 0 1px 0' }
          : { position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 40, maxWidth: 'calc(100% - 32px)', borderRadius: 10, boxShadow: 'var(--shadow-sm)' }),
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 16px', background: 'var(--warn-bg)', border: '1px solid var(--danger, var(--warn))',
        color: 'var(--text)', fontSize: 13,
      }}
    >
      <span>
        <strong>{failure.action}.</strong> {failure.message}{' '}
        Editing is paused so nothing else is lost. {failure.retryable ? 'Retry, or reload to discard the unsaved change.' : 'Reload to discard the unsaved change.'}
      </span>
      {failure.retryable && (
        <button onClick={() => retrySave(chartId)} style={button(true)}><RotateCw size={13} /> Retry</button>
      )}
      <button onClick={onReload} style={button(!failure.retryable)}><RefreshCw size={13} /> Reload</button>
    </div>
  )
}
