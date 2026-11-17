/**
 * A one-line "couldn't load X" with Retry, for a small control (a picker, a form) where the full-page `LoadError` would be too big (R-46).
 * A failed load must never look like an empty list.
 */
export function InlineLoadError({ what, onRetry, busy = false }: { what: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div
      role="alert"
      data-testid="inline-load-error"
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 12, color: 'var(--danger)', background: 'var(--danger-bg)', borderRadius: 8 }}
    >
      <span style={{ flex: 1 }}>Couldn't load {what}.</span>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        style={{ background: 'transparent', border: 'none', color: 'var(--brand)', fontSize: 12, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', padding: 0 }}
      >
        {busy ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  )
}
