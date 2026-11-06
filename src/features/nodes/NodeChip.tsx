import { memo } from 'react'
import { NODE_W, NODE_H } from './nodeSize'
import type { OrgNode } from '../../types'

/**
 * A role drawn as a plain coloured block, used instead of a full card when a big chart is zoomed out so far that
 * a card would be a few unreadable pixels (roadmap 3.4). One element and no children, so a thousand cost little.
 * Memoised, with handlers that take the id, so dragging one role re-renders one chip, not all of them.
 */
export const NodeChip = memo(function NodeChip({ node, colour, selected, connecting, isConnectTarget, dimmed, onPointerDown, onClick, onDoubleClick }: {
  node: OrgNode
  colour: string
  selected: boolean
  connecting: boolean
  isConnectTarget: boolean
  dimmed?: boolean
  onPointerDown: (e: React.PointerEvent, id: string) => void
  onClick: (e: React.MouseEvent, id: string) => void
  onDoubleClick: (e: React.MouseEvent, id: string) => void
}) {
  const open = node.status === 'open' || node.status === 'planned'
  return (
    <div
      data-testid="node-chip"
      onPointerDown={e => onPointerDown(e, node.id)}
      onClick={e => onClick(e, node.id)}
      onDoubleClick={e => onDoubleClick(e, node.id)}
      style={{
        position: 'absolute', left: node.x, top: node.y, width: NODE_W, height: NODE_H, boxSizing: 'border-box',
        borderRadius: 14, cursor: 'pointer',
        // Borders are in chart units, so they must be thick to show at a tenth of the size.
        border: `${selected || connecting || isConnectTarget ? 14 : open ? 8 : 0}px ${open && !selected ? 'dashed' : 'solid'} ${
          connecting ? 'var(--purple)' : isConnectTarget ? 'var(--success)' : selected ? 'var(--brand)' : colour}`,
        background: open ? 'transparent' : colour,
        opacity: dimmed ? 0.15 : 0.85,
      }}
    />
  )
})
