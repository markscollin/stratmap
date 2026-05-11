import type { ChartStatus } from '../../types'
import { STATUS_META } from '../../constants/statusMeta'

export function StatusBadge({ status }: { status: ChartStatus }) {
  const m = STATUS_META[status]
  if (!m) return null
  const Icon = m.Icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      background: m.bg, color: m.color,
      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <Icon size={10} />{m.label}
    </span>
  )
}
