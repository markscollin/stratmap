import { RotateCw } from 'lucide-react'

/**
 * "We could not load this" with a Retry (launch review R-14). A failed load must never look like an empty list or a page of zeros,
 * because that tells people their charts are gone.
 */
export function LoadError({ what, onRetry, busy = false }: { what: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div
      role="alert"
      data-testid="load-error"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '48px 28px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}
    >
      <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Couldn't load {what}</h3>
      <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 420, margin: '0 auto 20px' }}>
        Nothing has been lost: the page just couldn't reach the server. Check your connection and try again.
      </p>
      <button
        onClick={onRetry}
        disabled={busy}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', background: 'var(--brand)', border: 'none', borderRadius: 9, color: '#fff', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}
      >
        <RotateCw size={14} /> {busy ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  )
}
