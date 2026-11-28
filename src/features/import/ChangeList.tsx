// A titled list of changes (joiners, leavers, moves, edits), shared by "Update from file" (R-77) and the BambooHR sync (R-78).
export function ChangeList({ title, items }: { title: string; items: { id: string; text: string; note?: string }[] }) {
  const LIMIT = 30
  if (items.length === 0) return null
  return (
    <section aria-label={title} style={{ background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
      <h3 style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>{title} · {items.length}</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 150, overflowY: 'auto' }}>
        {items.slice(0, LIMIT).map(i => (
          <li key={i.id} style={{ color: 'var(--text)', lineHeight: 1.6 }}>
            {i.text}{i.note && <span style={{ color: 'var(--muted)' }}> · {i.note}</span>}
          </li>
        ))}
        {items.length > LIMIT && <li style={{ color: 'var(--muted)' }}>…and {items.length - LIMIT} more</li>}
      </ul>
    </section>
  )
}
