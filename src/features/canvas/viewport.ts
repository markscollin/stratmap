// Which roles and lines are worth drawing (roadmap 3.4). A big chart has far more roles than fit on screen,
// and every card is a React component with a dozen DOM nodes, so above VIRTUALIZE_ABOVE roles only the ones
// near the viewport are rendered. Pure geometry, unit-tested.
import { NODE_W, NODE_H } from '../nodes/nodeSize'

/** Charts with more roles than this render only what is near the screen. */
export const VIRTUALIZE_ABOVE = 300
/** Below this zoom a full card is a few unreadable pixels, so big charts draw plain chips instead. */
export const CHIP_BELOW_SCALE = 0.4

export interface Point { x: number; y: number }
export interface ViewTransform { x: number; y: number; scale: number }
export interface Rect { x0: number; y0: number; x1: number; y1: number }
interface Placed extends Point { id: string }

export const shouldVirtualize = (roleCount: number) => roleCount > VIRTUALIZE_ABOVE
export const shouldUseChips = (roleCount: number, scale: number) => shouldVirtualize(roleCount) && scale < CHIP_BELOW_SCALE

/** The part of the chart (chart coordinates) that is on screen, grown by `marginPx` screen pixels on every side. */
export function viewRect(t: ViewTransform, vp: { w: number; h: number }, marginPx = 240): Rect {
  return {
    // `+ 0` turns -0 into 0
    x0: (-t.x - marginPx) / t.scale + 0,
    y0: (-t.y - marginPx) / t.scale + 0,
    x1: (vp.w - t.x + marginPx) / t.scale,
    y1: (vp.h - t.y + marginPx) / t.scale,
  }
}

const nodeInView = (n: Point, r: Rect) => n.x + NODE_W >= r.x0 && n.x <= r.x1 && n.y + NODE_H >= r.y0 && n.y <= r.y1

/** Ids of the roles whose card touches the view. */
export function visibleNodeIds(nodes: Placed[], r: Rect): Set<string> {
  const out = new Set<string>()
  for (const n of nodes) if (nodeInView(n, r)) out.add(n.id)
  return out
}

/**
 * Whether a reporting line can be seen. A line between two roles that are both off screen still crosses the view
 * when they are on opposite sides of it, so this tests the line's bounding box, not just its ends.
 */
export function edgeInView(source: Point, target: Point, r: Rect): boolean {
  const x0 = Math.min(source.x, target.x),               x1 = Math.max(source.x, target.x) + NODE_W
  const y0 = Math.min(source.y + NODE_H, target.y),      y1 = Math.max(source.y + NODE_H, target.y)
  return x1 >= r.x0 && x0 <= r.x1 && y1 >= r.y0 && y0 <= r.y1
}

/** Roles whose position differs from what the server last saw: all a drag needs to send. */
export function movedPositions(
  nodes: Placed[],
  synced: ReadonlyMap<string, Point>,
): { id: string; x: number; y: number }[] {
  const out: { id: string; x: number; y: number }[] = []
  for (const n of nodes) {
    const s = synced.get(n.id)
    if (!s || s.x !== n.x || s.y !== n.y) out.push({ id: n.id, x: n.x, y: n.y })
  }
  return out
}
