// Reporting lines on the canvas (split out of OrgChart.tsx, R-35).
import { memo } from 'react'
import type { OrgNode } from '../../types'
import { NODE_W, NODE_H } from '../nodes/nodeSize'
import { toScreen, hexToRgba } from './canvasTypes'
import type { Transform } from './canvasTypes'

// ─── Edge SVG ─────────────────────────────────────────────────────────────────

/** A reporting line with no hit area, arrowhead or controls: what a big chart draws when zoomed far out (roadmap 3.4). */
export const EdgeLine = memo(function EdgeLine({ source, target, transform, colour, opacity }: {
  source: OrgNode; target: OrgNode; transform: Transform; colour: string; opacity: number
}) {
  const s  = toScreen(source.x + NODE_W / 2, source.y + NODE_H, transform)
  const e  = toScreen(target.x + NODE_W / 2, target.y,          transform)
  const dy = Math.max((e.y - s.y) * 0.45, 10)
  return (
    <path d={`M ${s.x} ${s.y} C ${s.x} ${s.y + dy} ${e.x} ${e.y - dy} ${e.x} ${e.y}`}
      fill="none" stroke={colour} strokeOpacity={0.55 * opacity} strokeWidth={1} style={{ pointerEvents: 'none' }} />
  )
})

export function EdgePath({
  source, target, transform, selected, hovered, deptColour, opacity,
  onClick, onMouseEnter, onMouseLeave, onDelete,
}: {
  source: OrgNode; target: OrgNode
  transform: Transform
  selected: boolean; hovered: boolean
  deptColour: string
  opacity?: number
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onDelete: () => void
}) {
  const s  = toScreen(source.x + NODE_W / 2, source.y + NODE_H, transform)
  const e  = toScreen(target.x + NODE_W / 2, target.y,          transform)
  const dy = Math.max((e.y - s.y) * 0.45, 30)
  const d  = `M ${s.x} ${s.y} C ${s.x} ${s.y+dy} ${e.x} ${e.y-dy} ${e.x} ${e.y}`

  const baseColour = selected ? 'var(--brand)' : hovered ? deptColour : hexToRgba(deptColour, 0.6)
  const width      = selected || hovered ? 2.5 : 1.5

  // Midpoint of the bezier (approximated as line midpoint — works for our vertical curves)
  const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 }

  // Arrowhead: our bezier always arrives vertically, so arrow points down (or up)
  const arrowDir = e.y >= s.y ? 1 : -1
  const arrowPath = `M ${e.x} ${e.y} L ${e.x - 5} ${e.y - 9 * arrowDir} L ${e.x + 5} ${e.y - 9 * arrowDir} Z`

  return (
    <g opacity={opacity ?? 1} style={{ transition: 'opacity .2s' }}>
      {/* Invisible wide hit area */}
      <path data-a11y-ok="known gap R-45: reporting lines cannot be selected by keyboard" d={d} fill="none" stroke="transparent" strokeWidth={14}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      />
      {/* Visible path */}
      <path d={d} fill="none" stroke={baseColour} strokeWidth={width}
        strokeLinecap="round"
        style={{ pointerEvents: 'none', transition: 'stroke .15s, stroke-width .15s' }}
      />
      {/* Arrowhead */}
      <path d={arrowPath} fill={baseColour}
        style={{ pointerEvents: 'none', transition: 'fill .15s' }}
      />
      {/* Delete button at midpoint — only when selected */}
      {selected && (
        <g data-a11y-ok="known gap R-45: reporting lines cannot be selected by keyboard" onClick={e => { e.stopPropagation(); onDelete() }} style={{ cursor: 'pointer' }}>
          <circle cx={mid.x} cy={mid.y} r={10}
            fill="var(--surface)" stroke="var(--danger)" strokeWidth={1.5}
          />
          <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central"
            fontSize={13} fill="var(--danger)"
            style={{ pointerEvents: 'none', fontFamily: "'DM Sans Variable', sans-serif", fontWeight: 700 }}
          >×</text>
        </g>
      )}
    </g>
  )
}

// ─── Connect mode indicator ───────────────────────────────────────────────────

export function ConnectingLine({ fromNode, mousePos, transform }: {
  fromNode: OrgNode; mousePos: { x: number; y: number }; transform: Transform
}) {
  const s  = toScreen(fromNode.x + NODE_W / 2, fromNode.y + NODE_H, transform)
  const e  = toScreen(mousePos.x, mousePos.y, transform)
  const dy = Math.abs(e.y - s.y) * 0.45
  const d  = `M ${s.x} ${s.y} C ${s.x} ${s.y+dy} ${e.x} ${e.y-dy} ${e.x} ${e.y}`
  return (
    <path d={d} fill="none" stroke="var(--purple)" strokeWidth={1.5}
      strokeDasharray="6 3" style={{ pointerEvents: 'none' }}
    />
  )
}

