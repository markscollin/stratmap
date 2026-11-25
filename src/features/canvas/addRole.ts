import type { OrgNode, OrgEdge } from '../../types'

// The first five minutes on a canvas (R-64): a new role should land under the person it reports to, not as another loose box.
// Pure, so the rules are tested on their own.

/**
 * Who a new role reports to by default: the selected role if there is one; else, when the chart has exactly one top role
 * (nobody above it), that one; else nobody. The person can always change it in the form.
 */
export function defaultReportsTo(nodes: OrgNode[], edges: OrgEdge[], selectedId: string | null): string {
  if (selectedId && nodes.some(n => n.id === selectedId)) return selectedId
  const hasManager = new Set(edges.map(e => e.targetId))
  const tops = nodes.filter(n => !hasManager.has(n.id))
  return tops.length === 1 ? tops[0].id : ''
}

/** Space between a manager's row and the row of their reports, and between two cards side by side. */
export const ROW_GAP = 80
export const COLUMN_GAP = 20

/**
 * Where a new direct report of `managerId` goes: one row below the manager, to the right of the manager's existing reports
 * (or straight under the manager for the first one), moved further right past any card already in that spot.
 */
export function placeUnderManager(managerId: string, nodes: OrgNode[], edges: OrgEdge[], size: { w: number; h: number }): { x: number; y: number } | null {
  const manager = nodes.find(n => n.id === managerId)
  if (!manager) return null
  const reportIds = new Set(edges.filter(e => e.sourceId === managerId).map(e => e.targetId))
  const reports = nodes.filter(n => reportIds.has(n.id))
  const y = manager.y + size.h + ROW_GAP
  let x = reports.length ? Math.max(...reports.map(r => r.x)) + size.w + COLUMN_GAP : manager.x
  const overlaps = (px: number) => nodes.some(n => Math.abs(n.x - px) < size.w + COLUMN_GAP / 2 && Math.abs(n.y - y) < size.h)
  for (let i = 0; i < 200 && overlaps(x); i++) x += size.w + COLUMN_GAP
  return { x, y }
}

/** Fitting a small chart never zooms out below this: a few roles at 58% are unreadable. Bigger charts fit as before. */
export const SMALL_CHART_MIN_SCALE = 0.8
export const SMALL_CHART_ROLES = 12

/** The zoom for "fit to view": everything on screen, at most 100%, and for a small chart not below SMALL_CHART_MIN_SCALE. */
export function fitScale(fit: number, roleCount: number): number {
  const scale = Math.min(fit, 1)
  return roleCount <= SMALL_CHART_ROLES ? Math.max(scale, SMALL_CHART_MIN_SCALE) : scale
}

/** The minimap is shown from this many roles up; a smaller chart fits on screen and the minimap is clutter. */
export const MINIMAP_FROM_ROLES = 20
