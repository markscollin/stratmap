const AVATAR_COLOURS = ['#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444']

export function AvatarStack({ initials }: { initials: string[] }) {
  return (
    <div style={{ display: 'flex' }}>
      {initials.slice(0, 4).map((ini, i) => (
        <div key={i} style={{
          width: 24, height: 24, borderRadius: '50%',
          background: AVATAR_COLOURS[i % AVATAR_COLOURS.length],
          border: '2px solid var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700, color: '#fff',
          marginLeft: i === 0 ? 0 : -7,
          zIndex: initials.length - i, position: 'relative',
        }}>{ini}</div>
      ))}
    </div>
  )
}
