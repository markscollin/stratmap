// The one place the canvas writes to the server (launch review R-01, R-02, R-03).
//
// Before this, every handler in OrgChart.tsx fired `api.x(...).catch(console.error)`: a failed save left
// the change on screen and lost it on reload, with no message. Now every chart-content write goes through
// `saveChange()`:
//   - writes to one chart run strictly one at a time, in the order the user made them (a role's POST must
//     finish before the line that points at it);
//   - the first failure STOPS the queue. Nothing the user did afterwards is sent, because it may depend on
//     the change that failed. `useCanvasSave().failure` says what failed and why, the canvas goes read-only
//     (CanvasView) and `SaveErrorBanner` offers Retry (for failures that can pass: offline, 5xx, 429) and
//     Reload (which throws the unsaved change away, and is an exact rollback because nothing after it was saved);
//   - a 409 `chart-changed` is already handled by the conflict banner; here it only stops the queue.
//
// Ids are made on the client (`crypto.randomUUID()`), so a role or reporting line drawn this session can be
// edited or deleted at once, and a retry of a create whose reply was lost is safe (the server returns the
// existing row for the same id).
import { create } from 'zustand'
import { api, ApiError } from '../../lib/apiClient'
import { useToastStore } from '../../store/toastStore'
import type { OrgNode, OrgEdge } from '../../types'

export interface SaveFailure {
  chartId: string
  /** What the user was doing, e.g. "Couldn't save the new role". */
  action: string
  /** Why, in words the user can act on. */
  message: string
  /** A retry can succeed (offline, 5xx, 429). Otherwise the only way out is Reload. */
  retryable: boolean
  /** The chart changed elsewhere (409). `ChartConflictBanner` explains it, so no second banner. */
  conflict: boolean
}

interface SaveOp {
  action: string
  run: () => Promise<unknown>
}

export const useCanvasSave = create<{ failure: SaveFailure | null; pending: number }>(() => ({ failure: null, pending: 0 }))

const queues = new Map<string, SaveOp[]>()
const draining = new Set<string>()

function bumpPending(by: number) {
  useCanvasSave.setState(s => ({ pending: Math.max(0, s.pending + by) }))
}

/** Why a write failed, and whether trying again could help. */
export function describeFailure(err: unknown): { message: string; retryable: boolean; conflict: boolean } {
  if (err instanceof ApiError) {
    const { status } = err
    if (status === 409 && err.message === 'chart-changed') {
      return { message: 'The chart was changed by someone else.', retryable: false, conflict: true }
    }
    if (status === 429) return { message: 'Too many changes too fast. Wait a moment and retry.', retryable: true, conflict: false }
    if (status === 408 || status >= 500) return { message: 'The server had a problem saving this. Your change is not lost yet: retry.', retryable: true, conflict: false }
    if (status === 401) return { message: 'You were signed out. Sign in again, then reload.', retryable: false, conflict: false }
    if (status === 403) return { message: "You don't have permission to edit this chart.", retryable: false, conflict: false }
    if (status === 404) return { message: 'That item no longer exists. Reload to get the latest version.', retryable: false, conflict: false }
    // 402 (plan limit / frozen / feature) and other 4xx: the server's own sentence, when it sent one.
    return { message: err.userMessage, retryable: false, conflict: false }
  }
  // fetch() itself rejected: offline, DNS, a dropped connection.
  return { message: "Can't reach the server. Check your connection and retry.", retryable: true, conflict: false }
}

async function drain(chartId: string) {
  if (draining.has(chartId)) return
  draining.add(chartId)
  try {
    const queue = queues.get(chartId)
    while (queue && queue.length) {
      if (useCanvasSave.getState().failure?.chartId === chartId) return // stopped until Retry or Reload
      const op = queue[0]
      try {
        await op.run()
        // reset (Reload) may have emptied the queue while this write was in flight
        if (queue[0] === op) { queue.shift(); bumpPending(-1) }
      } catch (err) {
        if (queue[0] !== op) return
        const why = describeFailure(err)
        const failure: SaveFailure = { chartId, action: op.action, ...why }
        useCanvasSave.setState({ failure })
        if (!why.conflict) useToastStore.getState().addToast(`${op.action}. ${why.message}`, 'error')
        console.error('[canvas] save failed:', op.action, err)
        return
      }
    }
  } finally {
    draining.delete(chartId)
  }
}

/** Queue one write. Nothing is sent while an earlier write to this chart has failed. */
export function saveChange(chartId: string, action: string, run: () => Promise<unknown>) {
  if (!chartId) return
  const queue = queues.get(chartId) ?? []
  queues.set(chartId, queue)
  queue.push({ action, run })
  bumpPending(1)
  void drain(chartId)
}

/** Try the failed write again, then carry on with everything queued behind it. */
export function retrySave(chartId: string) {
  const f = useCanvasSave.getState().failure
  if (!f || f.chartId !== chartId || !f.retryable) return
  useCanvasSave.setState({ failure: null })
  void drain(chartId)
}

/** Drop everything not yet saved (used when the chart is reloaded from the server). */
export function discardUnsaved(chartId: string) {
  const queue = queues.get(chartId)
  const dropped = queue?.length ?? 0
  // Emptied in place: a write already in flight holds this array and must find nothing left to send.
  queue?.splice(0, dropped)
  queues.delete(chartId)
  if (dropped) bumpPending(-dropped)
  if (useCanvasSave.getState().failure?.chartId === chartId) useCanvasSave.setState({ failure: null })
}

/** True while something for this chart is queued, in flight, or failed. */
export function hasUnsaved(chartId: string): boolean {
  return (queues.get(chartId)?.length ?? 0) > 0
}

/** For tests. */
export function resetCanvasSave() {
  queues.clear()
  draining.clear()
  useCanvasSave.setState({ failure: null, pending: 0 })
}

// ─── The writes themselves (one function per kind of change) ────────────────

/** Fields the server accepts for a role. Everything else (chartId, ...) is left out. */
function nodeBody(n: OrgNode) {
  const { id, name, title, departmentId, managerId, status, employmentType, roleType, avatarUrl, location, startDate, x, y, isNew } = n
  return { id, name, title, departmentId, managerId, status, employmentType, roleType, avatarUrl, location, startDate, x, y, isNew }
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function saveNewRole(chartId: string, node: OrgNode) {
  saveChange(chartId, "Couldn't save the new role", () => api.post(`/api/charts/${chartId}/nodes`, nodeBody(node)))
}

export function saveRoleEdit(chartId: string, nodeId: string, updates: Partial<OrgNode>) {
  // Position travels separately (drag / layout), and the id is in the path.
  const { id: _id, x: _x, y: _y, ...fields } = updates
  void _id; void _x; void _y
  if (Object.keys(fields).length === 0) return
  saveChange(chartId, "Couldn't save the change to this role", () => api.put(`/api/charts/${chartId}/nodes/${nodeId}`, fields))
}

export function saveRoleDelete(chartId: string, nodeId: string) {
  saveChange(chartId, "Couldn't delete the role", () => api.delete(`/api/charts/${chartId}/nodes/${nodeId}`))
}

export function saveNewLine(chartId: string, edge: OrgEdge) {
  saveChange(chartId, "Couldn't save the reporting line", () =>
    api.post(`/api/charts/${chartId}/edges`, { id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId }))
}

export function saveLineDelete(chartId: string, edgeId: string) {
  saveChange(chartId, "Couldn't remove the reporting line", () => api.delete(`/api/charts/${chartId}/edges/${edgeId}`))
}

/** Positions after a drag, a layout or an undo. `onSaved` lets the caller note what the server now holds. */
export function savePositions(chartId: string, positions: { id: string; x: number; y: number }[], action: string, onSaved?: () => void) {
  if (positions.length === 0) return
  saveChange(chartId, action, async () => {
    await api.put(`/api/charts/${chartId}/nodes`, positions)
    onSaved?.()
  })
}
