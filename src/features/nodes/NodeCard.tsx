import { useState } from 'react'
import { User } from 'lucide-react'
import type { OrgNode } from '../../types'
import { mockDepartments } from '../../data/mockOrg'
import { NODE_W, NODE_H } from '../../data/mockNodes'

const STATUS_DOT: Record<string, { color: string; label: string }> = {
  active:  { color: '#10B981', label: '' },
  open:    { color: '#F59E0B', label: 'OPEN' },
  planned: { color: '#8B5CF6', label: 'PLANNED' },
  backfill:{ color: '#0EA5E9', label: 'BACKFILL' },
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export function NodeCard({
  node,
  selected,
  connecting,
  isConnectTarget,
  onPointerDown,
  onClick,
}: {
  node: OrgNode
  selected: boolean
  connecting: boolean
  isConnectTarget: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onClick: (e: React.MouseEvent) => void
}) {
  const [hov, setHov] = useState(false)

  const dept = mockDepartments.find(d => d.id === node.departmentId)
  const deptColour = dept?.colour ?? '#0EA5E9'
  const isFilled   = node.status === 'active' || node.status === 'backfill'
  const label      = isFilled ? node.name : node.title
  const dot        = STATUS_DOT[node.status]

  const borderColor =
    connecting      ? 'var(--purple)' :
    isConnectTarget ? 'var(--success)' :
    selected        ? 'var(--brand)'   :
    hov             ? 'var(--border-hover)' :
    'var(--border)'

  const shadow =
    selected ? `0 0 0 3px var(--brand-bg), var(--shadow-sm)` :
    hov      ? 'var(--shadow)' :
    'var(--shadow-sm)'

  return (
    <div
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: NODE_W,
        height: NODE_H,
        borderRadius: 10,
        background: 'var(--surface)',
        border: `1.5px solid ${borderColor}`,
        boxShadow: shadow,
        display: 'flex',
        overflow: 'hidden',
        cursor: 'grab',
        transition: 'border-color .12s, box-shadow .12s',
        userSelect: 'none',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Dept accent bar */}
      <div style={{ width: 3, background: deptColour, flexShrink: 0 }} />

      {/* Avatar */}
      <div style={{
        width: 30, height: 30,
        margin: '17px 8px',
        borderRadius: '50%',
        background: isFilled ? deptColour : 'transparent',
        border: isFilled ? 'none' : `1.5px dashed ${deptColour}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color: isFilled ? '#fff' : deptColour,
        flexShrink: 0,
      }}>
        {isFilled ? initials(node.name) : <User size={13} color={deptColour} />}
      </div>

      {/* Text */}
      <div style={{ flex: 1, paddingRight: 8, paddingTop: 14, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }}>{label}</div>
        <div style={{
          fontSize: 10, color: 'var(--muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.3, marginTop: 2,
        }}>{node.title}</div>
      </div>

      {/* Status pill / dot */}
      {node.status !== 'active' && dot.label && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          fontSize: 9, fontWeight: 700, letterSpacing: '.4px',
          padding: '2px 5px', borderRadius: 4,
          background: `${dot.color}20`, color: dot.color,
        }}>{dot.label}</div>
      )}
      {node.isNew && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
          background: 'var(--brand-bg)', color: 'var(--brand)',
        }}>★ NEW</div>
      )}
    </div>
  )
}
