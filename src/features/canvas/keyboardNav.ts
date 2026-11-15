// Keyboard access to the canvas (R-32 item 4). Pure and unit-tested; OrgChart wires it to the DOM.
//
// The model people hear and feel: the chart is a tree of reporting lines.
//   Up    = the person this role reports to
//   Down  = the first (leftmost) role that reports to this one
//   Left / Right = the neighbouring role under the same manager (or the neighbouring top-level role)
// Tab walks the roles in reading order (top to bottom, then left to right), Enter or Space opens one.
import { NODE_W, NODE_H } from '../nodes/nodeSize'

interface Placed { id: string; x: number; y: number }
interface Line { sourceId: string; targetId: string }
export type NavKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

export const NAV_KEYS: readonly string[] = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
export const isNavKey = (k: string): k is NavKey => NAV_KEYS.includes(k)

/** Roles in reading order: rows top to bottom (a few pixels of difference is the same row), then left to right. */
export function readingOrder<T extends Placed>(nodes: T[]): T[] {
  const ROW = NODE_H / 2
  return [...nodes].sort((a, b) => (Math.abs(a.y - b.y) > ROW ? a.y - b.y : a.x - b.x) || a.id.localeCompare(b.id))
}

/** Who reports to whom, from the drawn lines. A role with several lines in reports to the first. */
export function buildReportingIndex(nodes: Placed[], edges: Line[]) {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const parentOf = new Map<string, string>()
  const childrenOf = new Map<string, string[]>()
  for (const e of edges) {
    if (!byId.has(e.sourceId) || !byId.has(e.targetId) || e.sourceId === e.targetId) continue
    if (!parentOf.has(e.targetId)) parentOf.set(e.targetId, e.sourceId)
    const list = childrenOf.get(e.sourceId) ?? []
    if (!list.includes(e.targetId)) list.push(e.targetId)
    childrenOf.set(e.sourceId, list)
  }
  const byX = (a: string, b: string) => byId.get(a)!.x - byId.get(b)!.x || a.localeCompare(b)
  for (const list of childrenOf.values()) list.sort(byX)
  const roots = nodes.filter(n => !parentOf.has(n.id)).map(n => n.id).sort(byX)
  return { parentOf, childrenOf, roots }
}
export type ReportingIndex = ReturnType<typeof buildReportingIndex>

/** The role an arrow key moves to from `fromId`, or null when there is nowhere to go that way. */
export function navTarget(index: ReportingIndex, fromId: string, key: NavKey): string | null {
  const parent = index.parentOf.get(fromId)
  if (key === 'ArrowUp') return parent ?? null
  if (key === 'ArrowDown') return index.childrenOf.get(fromId)?.[0] ?? null
  const siblings = parent ? index.childrenOf.get(parent) ?? [] : index.roots
  const at = siblings.indexOf(fromId)
  if (at < 0) return null
  return siblings[at + (key === 'ArrowRight' ? 1 : -1)] ?? null
}

/**
 * The smallest pan that brings a role fully on screen (with `margin` px to spare), or null when it already is.
 * Used when Tab or an arrow key lands on a role that is off screen.
 */
export function panToReveal(
  node: Placed,
  t: { x: number; y: number; scale: number },
  vp: { w: number; h: number },
  margin = 32,
): { x: number; y: number; scale: number } | null {
  const left = node.x * t.scale + t.x
  const top = node.y * t.scale + t.y
  const right = left + NODE_W * t.scale
  const bottom = top + NODE_H * t.scale
  const shift = (lo: number, hi: number, size: number) =>
    hi - lo > size - 2 * margin ? size / 2 - (lo + hi) / 2 // bigger than the view: centre it
      : lo < margin ? margin - lo : hi > size - margin ? size - margin - hi : 0
  const dx = shift(left, right, vp.w)
  const dy = shift(top, bottom, vp.h)
  return dx === 0 && dy === 0 ? null : { ...t, x: t.x + dx, y: t.y + dy }
}

/** What a screen reader says for a role: who, what, status, and where it sits in the reporting lines. */
export function roleAriaLabel(
  node: { id: string; name: string; title: string; status: string },
  index: ReportingIndex,
  nameOf: (id: string) => string,
): string {
  const parts = [node.name === node.title ? node.title : `${node.name}, ${node.title}`]
  if (node.status !== 'active') parts.push(node.status)
  const boss = index.parentOf.get(node.id)
  parts.push(boss ? `reports to ${nameOf(boss)}` : 'top level')
  const n = index.childrenOf.get(node.id)?.length ?? 0
  if (n > 0) parts.push(`${n} direct report${n === 1 ? '' : 's'}`)
  return parts.join(', ')
}
