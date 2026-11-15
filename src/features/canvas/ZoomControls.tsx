// Zoom buttons (split out of OrgChart.tsx, R-35).
import { Plus, Minus } from 'lucide-react'

// ─── Zoom controls ────────────────────────────────────────────────────────────

export function ZoomControls({ scale, onZoom, onFit }: { scale: number; onZoom: (d: number) => void; onFit: () => void }) {
  return (
    <div data-export-ignore style={{
      position: 'absolute', bottom: 16, right: 16, zIndex: 20,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '5px 8px',
      display: 'flex', alignItems: 'center', gap: 6, boxShadow: 'var(--shadow-sm)',
    }}>
      <button aria-label="Zoom out" onClick={() => onZoom(-0.1)} style={zoomBtnStyle}><Minus size={11} /></button>
      <button aria-label="Fit to view" title="Fit to view" onClick={onFit} style={{ ...zoomBtnStyle, minWidth: 46, fontSize: 11, color: 'var(--muted)' }}>
        {Math.round(scale * 100)}%
      </button>
      <button aria-label="Zoom in" onClick={() => onZoom(+0.1)} style={zoomBtnStyle}><Plus size={11} /></button>
    </div>
  )
}

const zoomBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: 5,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--muted)', cursor: 'pointer', fontSize: 14,
}

