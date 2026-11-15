/** What shows while a page's code is being downloaded (R-24). Full height by default; `inline` fills the area of the app shell instead. */
export function PageFallback({ inline = false }: { inline?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="page-fallback"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: inline ? '100%' : '100vh', minHeight: inline ? 240 : undefined,
        background: 'var(--bg)', color: 'var(--muted)', fontSize: 14,
      }}
    >
      Loading…
    </div>
  )
}
