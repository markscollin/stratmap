import { X } from 'lucide-react'
import { useToastStore } from '../../store/toastStore'

const STYLES = {
  success: { dot: 'var(--success)',  border: 'rgba(16,185,129,0.25)' },
  error:   { dot: 'var(--danger)',   border: 'rgba(239,68,68,0.25)'  },
  warning: { dot: 'var(--warn)',     border: 'rgba(245,158,11,0.25)' },
  info:    { dot: 'var(--brand)',    border: 'rgba(14,165,233,0.25)' },
}

export function ToastStack() {
  const { toasts, removeToast } = useToastStore()
  if (toasts.length === 0) return null
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => {
        const s = STYLES[toast.variant]
        return (
          <div key={toast.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px 10px 12px',
            borderRadius: 10, background: 'var(--surface)',
            border: `1px solid ${s.border}`,
            boxShadow: 'var(--shadow)',
            color: 'var(--text)', fontSize: 13,
            animation: 'fadeUp .2s ease-out',
            whiteSpace: 'nowrap',
            pointerEvents: 'all',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
            {toast.message}
            <button onClick={() => removeToast(toast.id)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--dim)', display: 'flex', padding: 0, marginLeft: 2,
            }}>
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
