// The overview map in the corner (split out of OrgChart.tsx, R-35).
import { useMemo, memo } from 'react'
import type { OrgNode } from '../../types'
import { NODE_W, NODE_H } from '../nodes/nodeSize'
import type { Transform } from './canvasTypes'
import type { DepartmentLike } from '../../lib/departments'

// ─── Minimap ──────────────────────────────────────────────────────────────────

const MM_W = 160
const MM_H = 90

const NO_DEPT_COLOUR = '#94A3B8'

/** The minimap's role dots. Memoised: panning and zooming change only the viewport rectangle, not these. */
export const MinimapDots = memo(function MinimapDots({ nodes, departments, minX, minY, mmScale }: { nodes: OrgNode[]; departments: readonly DepartmentLike[]; minX: number; minY: number; mmScale: number }) {
  // Same lookup as the cards (R-47 / R-48): a role's colour is its department's, chart first.
  const colours = useMemo(() => new Map(departments.map(d => [d.id, d.colour])), [departments])
  return (
    <>
      {nodes.map(n => (
        <rect key={n.id}
          x={(n.x - minX) * mmScale} y={(n.y - minY) * mmScale}
          width={NODE_W * mmScale} height={NODE_H * mmScale}
          rx={2} fill={colours.get(n.departmentId) ?? NO_DEPT_COLOUR} fillOpacity={0.55}
        />
      ))}
    </>
  )
})

export function Minimap({ nodes, departments, transform, vpW, vpH, onPanTo }: {
  nodes: OrgNode[]; departments: readonly DepartmentLike[]; transform: Transform; vpW: number; vpH: number
  onPanTo: (x: number, y: number) => void
}) {
  // Bounds only change when roles move, not when the view pans or zooms (roadmap 3.4).
  const bounds = useMemo(() => {
    if (nodes.length === 0) return null
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of nodes) { if (n.x < x0) x0 = n.x; if (n.y < y0) y0 = n.y; if (n.x > x1) x1 = n.x; if (n.y > y1) y1 = n.y }
    const minX = x0 - 40, minY = y0 - 40
    const cW = x1 + NODE_W + 40 - minX, cH = y1 + NODE_H + 40 - minY
    return { minX, minY, mmScale: Math.min(MM_W / cW, MM_H / cH) }
  }, [nodes])
  if (!bounds) return null
  const { minX, minY, mmScale } = bounds
  const vpCX = -transform.x / transform.scale, vpCY = -transform.y / transform.scale
  const vpCW = vpW / transform.scale,           vpCH = vpH / transform.scale
  const vpMMX = (vpCX - minX) * mmScale, vpMMY = (vpCY - minY) * mmScale
  const vpMMW = vpCW * mmScale,          vpMMH = vpCH * mmScale

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx   = (e.clientX - rect.left)  / mmScale + minX
    const my   = (e.clientY - rect.top)   / mmScale + minY
    onPanTo(-(mx * transform.scale - vpW / 2), -(my * transform.scale - vpH / 2))
  }

  return (
    <div data-export-ignore style={{
      position: 'absolute', bottom: 56, left: 16, zIndex: 20,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
    }}>
      <svg data-a11y-ok="pointer shortcut; the keyboard pans through the roles (arrow keys)" width={MM_W} height={MM_H} style={{ display: 'block', cursor: 'crosshair' }} onClick={handleClick}>
        <MinimapDots nodes={nodes} departments={departments} minX={minX} minY={minY} mmScale={mmScale} />
        <rect x={vpMMX} y={vpMMY} width={vpMMW} height={vpMMH}
          fill="rgba(14,165,233,0.08)" stroke="var(--brand)" strokeWidth={1.5}
          rx={2} style={{ pointerEvents: 'none' }}
        />
      </svg>
    </div>
  )
}

