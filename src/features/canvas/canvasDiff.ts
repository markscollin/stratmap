// What an undo or redo has to tell the server (launch review R-02).
//
// Undo and redo move the canvas to another snapshot. The server must end up holding that snapshot, so we work out the
// difference and send it through the same save queue as any other edit. Pure: the tests cover it without a browser.
import type { OrgNode, OrgEdge } from '../../types'

export interface CanvasState { nodes: OrgNode[]; edges: OrgEdge[] }

export type HistoryWrite =
  | { kind: 'delete-line'; id: string }
  | { kind: 'delete-role'; id: string }
  | { kind: 'bring-back-role'; node: OrgNode }
  | { kind: 'edit-role'; id: string; fields: Partial<OrgNode> }
  | { kind: 'add-line'; edge: OrgEdge }
  | { kind: 'move'; positions: { id: string; x: number; y: number }[] }

/** Role fields the server stores as null when cleared. */
const NULLABLE: (keyof OrgNode)[] = ['roleType', 'avatarUrl', 'location', 'startDate', 'isNew', 'managerId']
const FIELDS: (keyof OrgNode)[] = ['name', 'title', 'departmentId', 'managerId', 'status', 'employmentType', 'roleType', 'avatarUrl', 'location', 'startDate', 'isNew']

function changedFields(before: OrgNode, after: OrgNode): Partial<OrgNode> | null {
  const out: Record<string, unknown> = {}
  for (const key of FIELDS) {
    if ((before[key] ?? null) === (after[key] ?? null)) continue
    if (after[key] === undefined || after[key] === null) {
      if (NULLABLE.includes(key)) out[key] = null // cleared
      continue
    }
    out[key] = after[key]
  }
  return Object.keys(out).length ? (out as Partial<OrgNode>) : null
}

/**
 * Writes, in the order they must be sent, that turn the server's copy of `from` into `to`:
 * lines and roles that went away, roles that came back, edited fields, lines that came back, positions.
 * A line that touches a deleted role is not deleted separately: deleting the role removes it on the server.
 */
export function diffCanvas(from: CanvasState, to: CanvasState): HistoryWrite[] {
  const before = new Map(from.nodes.map(n => [n.id, n]))
  const after  = new Map(to.nodes.map(n => [n.id, n]))
  const removed = from.nodes.filter(n => !after.has(n.id))
  const removedIds = new Set(removed.map(n => n.id))
  const added = to.nodes.filter(n => !before.has(n.id))
  const edgeIdsBefore = new Set(from.edges.map(e => e.id))
  const edgeIdsAfter  = new Set(to.edges.map(e => e.id))

  const writes: HistoryWrite[] = []
  for (const e of from.edges) {
    if (!edgeIdsAfter.has(e.id) && !removedIds.has(e.sourceId) && !removedIds.has(e.targetId)) writes.push({ kind: 'delete-line', id: e.id })
  }
  for (const n of removed) writes.push({ kind: 'delete-role', id: n.id })
  for (const n of added) writes.push({ kind: 'bring-back-role', node: n })
  for (const n of to.nodes) {
    const prev = before.get(n.id)
    const fields = prev && changedFields(prev, n)
    if (fields) writes.push({ kind: 'edit-role', id: n.id, fields })
  }
  for (const e of to.edges) {
    if (!edgeIdsBefore.has(e.id)) writes.push({ kind: 'add-line', edge: e })
  }
  const moved = to.nodes
    .filter(n => {
      const prev = before.get(n.id)
      return !prev || prev.x !== n.x || prev.y !== n.y // a role brought back is placed where the snapshot has it
    })
    .map(n => ({ id: n.id, x: n.x, y: n.y }))
  if (moved.length) writes.push({ kind: 'move', positions: moved })
  return writes
}
