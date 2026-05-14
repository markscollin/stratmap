import { useState } from 'react'
import { User, Briefcase, Clock, RefreshCw } from 'lucide-react'
import type { OrgNode, RoleType } from '../../types'
import { mockDepartments } from '../../data/mockOrg'
import { NODE_W, NODE_H } from '../../data/mockNodes'

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

type StatusBadgeConfig = { color: string; bg: string; icon: React.ReactNode; label: string }

type RoleTypeBadgeConfig = { color: string; bg: string; label: string }

function getRoleTypeBadge(roleType: RoleType | undefined): RoleTypeBadgeConfig | null {
  switch (roleType) {
    case 'new-headcount': return { color: 'var(--success)', bg: 'var(--success-bg)', label: 'NEW HC'   }
    case 'backfill':      return { color: 'var(--warn)',    bg: 'var(--warn-bg)',    label: 'BACKFILL' }
    case 'contractor':    return { color: 'var(--purple)',  bg: 'var(--purple-bg)', label: 'CONTRACT' }
    case 'tbd':           return { color: 'var(--dim)',     bg: 'var(--raised)',    label: 'TBD'      }
    default: return null
  }
}

function getStatusBadge(status: OrgNode['status']): StatusBadgeConfig | null {
  switch (status) {
    case 'open':     return { color: 'var(--warn)',   bg: 'var(--warn-bg)',   icon: <Briefcase size={8} />, label: 'OPEN'     }
    case 'planned':  return { color: 'var(--purple)', bg: 'var(--purple-bg)', icon: <Clock size={8} />,     label: 'PLANNED'  }
    case 'backfill': return { color: 'var(--brand)',  bg: 'var(--brand-bg)',  icon: <RefreshCw size={8} />, label: 'BACKFILL' }
    default: return null
  }
}

function StatusPill({ config }: { config: StatusBadgeConfig }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 5px', borderRadius: 20,
      background: config.bg, color: config.color,
      fontSize: 9, fontWeight: 700, letterSpacing: '.3px', flexShrink: 0,
    }}>
      {config.icon}{config.label}
    </span>
  )
}

export function NodeCard({
  node,
  selected,
  connecting,
  isConnectTarget,
  onPointerDown,
  onClick,
  onDoubleClick,
}: {
  node: OrgNode
  selected: boolean
  connecting: boolean
  isConnectTarget: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
}) {
  const [hov, setHov] = useState(false)

  const dept          = mockDepartments.find(d => d.id === node.departmentId)
  const deptColour    = dept?.colour ?? '#94A3B8'
  const isUnfilled    = node.status === 'open' || node.status === 'planned'
  const label         = isUnfilled ? node.title : node.name
  const statusBadge   = getStatusBadge(node.status)
  const roleTypeBadge = getRoleTypeBadge(node.roleType)

  const borderColor =
    connecting      ? 'var(--purple)'      :
    isConnectTarget ? 'var(--success)'     :
    selected        ? 'var(--brand)'       :
    hov             ? 'var(--border-hover)':
    'var(--border)'

  const shadow =
    selected ? `0 0 0 3px var(--brand-bg), var(--shadow-sm)` :
    hov      ? 'var(--shadow)' :
    'var(--shadow-sm)'

  const employmentLabel =
    node.employmentType === 'contractor' ? 'CONTRACT' :
    node.employmentType === 'advisor'    ? 'ADVISOR'  : null

  return (
    <div
      style={{
        position: 'absolute', left: node.x, top: node.y,
        width: NODE_W, height: NODE_H,
        borderRadius: 12,
        background: 'var(--surface)',
        border: `1.5px solid ${borderColor}`,
        boxShadow: shadow,
        display: 'flex', overflow: 'hidden',
        cursor: 'grab',
        transition: 'border-color .12s, box-shadow .12s, transform .12s',
        transform: hov && !selected ? 'translateY(-1px)' : 'none',
        userSelect: 'none', touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Dept accent bar */}
      <div style={{ width: 3, background: deptColour, flexShrink: 0 }} />

      {/* Avatar */}
      <div style={{
        width: 36, height: 36,
        margin: '22px 8px 22px 10px',
        borderRadius: '50%', flexShrink: 0,
        background: isUnfilled ? hexToRgba(deptColour, 0.15) : deptColour,
        border: isUnfilled ? `1px solid ${hexToRgba(deptColour, 0.4)}` : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: isUnfilled ? deptColour : '#fff',
      }}>
        {isUnfilled
          ? <User size={14} color={deptColour} />
          : initials(node.name)
        }
      </div>

      {/* Text content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 10, minWidth: 0, gap: 3 }}>
        {/* Row 1: name + status/new badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, fontStyle: isUnfilled ? 'italic' : 'normal',
          }}>{label}</span>
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {node.isNew && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 2,
                padding: '2px 5px', borderRadius: 20,
                background: 'rgba(20,184,166,0.15)', color: '#14B8A6',
                fontSize: 9, fontWeight: 700, letterSpacing: '.3px',
              }}>★ NEW</span>
            )}
            {statusBadge && <StatusPill config={statusBadge} />}
          </div>
        </div>

        {/* Row 2: job title + employment type */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            fontSize: 11, color: 'var(--muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>{node.title}</span>
          {employmentLabel && (
            <span style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 600, flexShrink: 0 }}>
              {employmentLabel}
            </span>
          )}
        </div>

        {/* Row 3: role type badge (only for non-existing types) */}
        {roleTypeBadge && (
          <div>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '1px 5px', borderRadius: 4,
              background: roleTypeBadge.bg, color: roleTypeBadge.color,
              fontSize: 9, fontWeight: 700, letterSpacing: '.3px',
            }}>
              {roleTypeBadge.label}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
