// Comparing two versions of a chart (roadmap 5): what a scenario changes. Pure, so the rules are covered by tests.
//
// What counts as a difference: a role added or removed, and for roles in both: name, title, department, status, role type,
// employment type, location, start date, and WHO THEY REPORT TO (from the reporting lines, which is what the chart draws).
// What does not: where a box sits on the canvas, avatars, the "new" star.

export interface DiffNode {
  id: string
  name: string
  title: string
  departmentId: string | null
  status: string
  roleType: string | null
  employmentType: string
  location: string | null
  startDate: string | null
}
export interface DiffState {
  nodes: DiffNode[]
  edges: { sourceId: string; targetId: string }[]
  departments: { id: string; name: string }[]
}

export interface FieldChange { field: string; from: string; to: string }
export interface RoleChange { id: string; label: string; changes: FieldChange[] }
export interface CountPair { before: number; after: number }

export interface SnapshotDiff {
  added: { id: string; label: string; department: string }[]
  removed: { id: string; label: string; department: string }[]
  changed: RoleChange[]
  headcount: {
    roles: CountPair
    /** Roles that are still to be hired (status open or planned). */
    open: CountPair
    byDepartment: { name: string; before: number; after: number }[]
  }
  /** Nothing differs (positions on the canvas are ignored). */
  identical: boolean
}

const NO_DEPARTMENT = 'No department'
const UNFILLED = new Set(['open', 'planned'])

/** How a role is called in a list: "Ada Lovelace, CTO", or "Engineer (open)" while it is still to be filled. */
export function roleLabel(n: Pick<DiffNode, 'name' | 'title' | 'status'>): string {
  if (UNFILLED.has(n.status)) return `${n.title} (open)`
  return !n.name || n.name === n.title ? n.title : `${n.name}, ${n.title}`
}

function index(state: DiffState) {
  const departments = new Map(state.departments.map(d => [d.id, d.name]))
  const byId = new Map(state.nodes.map(n => [n.id, n]))
  // Each role reports to the source of its first incoming line (sorted, so the answer never depends on array order).
  const parent = new Map<string, string>()
  for (const e of [...state.edges].sort((a, b) => a.sourceId.localeCompare(b.sourceId))) {
    if (byId.has(e.sourceId) && byId.has(e.targetId) && e.sourceId !== e.targetId && !parent.has(e.targetId)) parent.set(e.targetId, e.sourceId)
  }
  const departmentOf = (n: DiffNode) => (n.departmentId ? departments.get(n.departmentId) : undefined) ?? NO_DEPARTMENT
  const reportsTo = (n: DiffNode) => { const p = parent.get(n.id); return p ? roleLabel(byId.get(p)!) : 'nobody (top of the chart)' }
  return { byId, departmentOf, reportsTo }
}

const show = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? '(none)' : v)

export function diffSnapshots(before: DiffState, after: DiffState): SnapshotDiff {
  const a = index(before), b = index(after)
  const added: SnapshotDiff['added'] = []
  const removed: SnapshotDiff['removed'] = []
  const changed: RoleChange[] = []

  for (const n of after.nodes) if (!a.byId.has(n.id)) added.push({ id: n.id, label: roleLabel(n), department: b.departmentOf(n) })
  for (const n of before.nodes) {
    const m = b.byId.get(n.id)
    if (!m) { removed.push({ id: n.id, label: roleLabel(n), department: a.departmentOf(n) }); continue }
    const pairs: [string, string, string][] = [
      ['name', show(n.name), show(m.name)],
      ['title', show(n.title), show(m.title)],
      ['department', a.departmentOf(n), b.departmentOf(m)],
      ['status', show(n.status), show(m.status)],
      ['role type', show(n.roleType), show(m.roleType)],
      ['employment type', show(n.employmentType), show(m.employmentType)],
      ['location', show(n.location), show(m.location)],
      ['start date', show(n.startDate), show(m.startDate)],
      ['reports to', a.reportsTo(n), b.reportsTo(m)],
    ]
    const changes = pairs.filter(([, from, to]) => from !== to).map(([field, from, to]) => ({ field, from, to }))
    if (changes.length > 0) changed.push({ id: n.id, label: roleLabel(m), changes })
  }

  const byLabel = (x: { label: string }, y: { label: string }) => x.label.localeCompare(y.label)
  added.sort(byLabel); removed.sort(byLabel); changed.sort(byLabel)

  const counts = new Map<string, { before: number; after: number }>()
  const bump = (name: string, side: 'before' | 'after') => counts.set(name, { ...(counts.get(name) ?? { before: 0, after: 0 }), [side]: (counts.get(name)?.[side] ?? 0) + 1 })
  for (const n of before.nodes) bump(a.departmentOf(n), 'before')
  for (const n of after.nodes) bump(b.departmentOf(n), 'after')
  const byDepartment = [...counts].map(([name, c]) => ({ name, ...c })).sort((x, y) => x.name.localeCompare(y.name))

  const open = (s: DiffState) => s.nodes.filter(n => UNFILLED.has(n.status)).length
  return {
    added, removed, changed,
    headcount: { roles: { before: before.nodes.length, after: after.nodes.length }, open: { before: open(before), after: open(after) }, byDepartment },
    identical: added.length === 0 && removed.length === 0 && changed.length === 0,
  }
}
