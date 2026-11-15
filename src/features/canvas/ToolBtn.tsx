// One toolbar icon button (split out of OrgChart.tsx, R-35).
import { useState } from 'react'

export function ToolBtn({ Icon, label, active, disabled, onClick }: {
  Icon: React.FC<{ size?: number }>; label: string; active: boolean; disabled?: boolean; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} title={label} aria-label={label} aria-pressed={active || undefined} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: 6,
        background: active ? 'var(--brand-bg)' : hov ? 'var(--nav-hover)' : 'transparent',
        border: active ? '1px solid var(--brand)' : '1px solid transparent',
        color: active ? 'var(--brand)' : disabled ? 'var(--dim)' : hov ? 'var(--text)' : 'var(--muted)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all .12s',
      }}
    >
      <Icon size={13} />
    </button>
  )
}

