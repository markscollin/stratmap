// Client half of edit-conflict safety (roadmap 2.4; server half is api/_lib/revision.ts).
//
// The server numbers every structural edit of a chart (`revision`). We remember the
// latest number we have seen per chart and send it with each structural write; if
// someone else edited in between, the server answers 409 `chart-changed`.
//
// Writes to one chart are sent one at a time, in order. The canvas fires several
// requests back to back (add a role, then its reporting line), and each one needs the
// revision returned by the one before it. Moving boxes is not structural and is not queued.
import { create } from 'zustand'

export const REVISION_HEADER = 'X-Chart-Revision'

const revisions = new Map<string, number>()
const chains = new Map<string, Promise<unknown>>()

/** Set when the server refused a write because the chart changed elsewhere. */
export const useChartConflict = create<{
  chartId: string | null
  flag: (chartId: string) => void
  clear: () => void
}>((set) => ({
  chartId: null,
  flag: (chartId) => set({ chartId }),
  clear: () => set({ chartId: null }),
}))

const CHART_PATH = /^\/api\/charts\/([^/?#]+)(?:\/(nodes|edges|import)(?:\/([^/?#]+)(?:\/(restore))?)?)?(?:[?#].*)?$/

/** The chart id if `path` is anywhere under /api/charts/:id (used to remember revisions). */
export function chartIdOfPath(path: string): string | null {
  return CHART_PATH.exec(path)?.[1] ?? null
}

/** True for exactly GET /api/charts/:id, the only response whose body carries `revision`. */
export function isChartRead(method: string, path: string): boolean {
  const m = CHART_PATH.exec(path)
  return method === 'GET' && !!m && !m[2]
}

/** The chart id if this request is a structural edit (what the server counts as a revision). */
export function structuralChartId(method: string, path: string): string | null {
  const m = CHART_PATH.exec(path)
  if (!m) return null
  const [, id, sub, subId, action] = m
  if (!sub) return method === 'PUT' ? id : null                       // rename / status / sharing
  if (sub === 'nodes' && action === 'restore') return method === 'POST' ? id : null          // Undo of a role delete
  if (sub === 'nodes') return subId ? (method === 'PUT' || method === 'DELETE' ? id : null) : (method === 'POST' ? id : null) // PUT /nodes = positions
  if (sub === 'edges') return subId ? (method === 'DELETE' ? id : null) : (method === 'POST' ? id : null)
  return sub === 'import' && method === 'POST' ? id : null
}

export function rememberRevision(chartId: string, value: unknown) {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n === 'number' && Number.isInteger(n) && n >= 0) revisions.set(chartId, n)
}

export function revisionHeader(chartId: string): Record<string, string> {
  const r = revisions.get(chartId)
  return r === undefined ? {} : { [REVISION_HEADER]: String(r) }
}

/** Runs `task` after every earlier structural write to the same chart has finished. */
export function inOrder<T>(chartId: string, task: () => Promise<T>): Promise<T> {
  const run = (chains.get(chartId) ?? Promise.resolve()).catch(() => undefined).then(task)
  chains.set(chartId, run)
  return run
}

export function hasConflict(chartId: string): boolean {
  return useChartConflict.getState().chartId === chartId
}

/** For tests. */
export function resetChartRevisions() {
  revisions.clear()
  chains.clear()
  useChartConflict.getState().clear()
}
