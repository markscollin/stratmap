import { useState } from 'react'
import { Sparkles } from 'lucide-react'

/**
 * Shown on the opt-in sample chart (roadmap 2.7): says it is example data and makes it easy to delete.
 * Only admins can delete a chart, so everyone else is told to ask one.
 */
export function SampleChartBanner({ canDelete, onDelete, flow = false }: { canDelete: boolean; onDelete: () => void; flow?: boolean }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div
      role="status"
      data-testid="sample-banner"
      data-export-ignore
      style={{
        ...(flow
          ? { flexShrink: 0, borderRadius: 0, borderWidth: '0 0 1px 0' }
          : { position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 30, maxWidth: 'calc(100% - 32px)', borderRadius: 10, boxShadow: 'var(--shadow-sm)' }),
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '9px 14px', background: 'var(--purple-bg)', border: '1px solid var(--purple)',
        color: 'var(--text)', fontSize: 13,
      }}
    >
      <Sparkles size={15} color="var(--purple)" style={{ flexShrink: 0 }} />
      <span>
        <strong>This is sample data.</strong>{' '}
        {canDelete ? 'Explore freely, then delete it to start your own.' : 'Ask a workspace admin to delete it when you are done.'}
      </span>
      {canDelete && !confirming && (
        <button data-testid="sample-delete" onClick={() => setConfirming(true)} style={btn('secondary')}>Delete sample</button>
      )}
      {canDelete && confirming && (
        <span style={{ display: 'flex', gap: 6 }}>
          <button data-testid="sample-delete-confirm" onClick={onDelete} style={btn('danger')}>Yes, delete</button>
          <button onClick={() => setConfirming(false)} style={btn('secondary')}>Keep it</button>
        </span>
      )}
    </div>
  )
}

function btn(kind: 'secondary' | 'danger'): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    background: kind === 'danger' ? 'var(--danger)' : 'transparent',
    color: kind === 'danger' ? '#fff' : 'var(--text)',
    border: kind === 'danger' ? 'none' : '1px solid var(--border-hover)',
  }
}
