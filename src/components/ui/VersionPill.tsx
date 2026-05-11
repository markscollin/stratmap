export function VersionPill({ version }: { version: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 20,
      background: 'var(--raised)', border: '1px solid var(--border)',
      fontSize: 10, fontWeight: 600, color: 'var(--dim)',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      v{version}
    </span>
  )
}
