import type { OrgNode, OrgEdge, Department } from '../types'
import { buildImportPlan, type ColumnMapping, type ImportIssue, type ParsedSheet } from './importOrg'
import { isUnfilled } from './exportOrg'
import { placeUnderManager } from '../features/canvas/addRole'

// R-77 "Update from file": bring an existing chart in line with a new export from the HR system (or the same
// spreadsheet, edited). Pure, so every rule is unit tested; the dialog shows the result as a list of changes and
// nothing is written until the person accepts it.
//
// Rules:
// - The file is read with the importer's own rules (importOrg.ts): same columns, same errors and warnings.
// - A row finds its role by the file's ID (stored on the role by an earlier import or update), then by email, then, only
//   for roles that have neither key yet, by a full name that is unique on both sides. Matched roles keep their id, so their
//   comments, job descriptions and position stay.
// - Only columns the file has are changed: a file without a Location column leaves every location alone.
// - Joiners are new roles, placed under their manager. Leavers are roles the file does not have that are people or came
//   from a file; open and planned roles made in StratMap (no key) are kept, since an HR export does not list them.
// - Reporting lines: a role in the file gets the manager the file names. Its other lines (a dotted line someone drew) stay,
//   unless they touch a leaver.

export type ChangedField = 'name' | 'title' | 'department' | 'location' | 'startDate' | 'roleType' | 'status' | 'employmentType'

export const CHANGED_FIELD_LABEL: Record<ChangedField, string> = {
  name: 'Name', title: 'Title', department: 'Department', location: 'Location', startDate: 'Start date',
  roleType: 'Role type', status: 'Status', employmentType: 'Employment type',
}

export interface FieldChange { field: ChangedField; from: string; to: string }

export interface UpdateCurrent {
  nodes: OrgNode[]
  edges: OrgEdge[]
  /** The chart's departments first, then the workspace's (what a role's departmentId can point at). */
  departments: Department[]
}

export interface UpdateOptions {
  /** The plan's per-chart role limit; -1 or undefined for unlimited. */
  maxNodes?: number
  /** Remove leavers (default). When false they are listed but kept. */
  removeLeavers?: boolean
  /** Card size, for placing joiners. */
  size?: { w: number; h: number }
  /** Id maker, injectable for tests. */
  newId?: (prefix: 'n' | 'e' | 'd') => string
}

export interface UpdatePlan {
  issues: ImportIssue[]
  blocked: boolean
  joiners: { id: string; label: string; manager: string | null }[]
  leavers: { id: string; label: string; removed: boolean }[]
  moves: { id: string; label: string; from: string | null; to: string | null }[]
  edits: { id: string; label: string; changes: FieldChange[] }[]
  /** Roles in the file that nothing changes. */
  unchanged: number
  /** Roles not in the file that stay (open and planned roles made in StratMap, or leavers when kept). */
  kept: number
  matchedBy: { id: number; email: number; name: number }
  hasChanges: boolean
  /** The whole chart after the update, and the departments it creates. */
  result: { nodes: OrgNode[]; edges: OrgEdge[]; newDepartments: Department[] }
  overLimit: { max: number; wouldHave: number } | null
}

const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

export function roleLabel(n: OrgNode): string {
  return isUnfilled(n) ? `${n.title} (open role)` : n.name
}

/** The first reporting line into each role (lines are ordered by id, as the server sends them). */
function primaryManagers(edges: OrgEdge[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const e of [...edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (!out.has(e.targetId)) out.set(e.targetId, e.sourceId)
  }
  return out
}

function findLoop(nodes: OrgNode[], edges: OrgEdge[]): string[] | null {
  const up = new Map<string, string[]>()
  for (const e of edges) up.set(e.targetId, [...(up.get(e.targetId) ?? []), e.sourceId])
  const state = new Map<string, 1 | 2>()
  const path: string[] = []
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 2) return null
    if (state.get(id) === 1) return path.slice(path.indexOf(id))
    state.set(id, 1)
    path.push(id)
    for (const m of up.get(id) ?? []) {
      const loop = visit(m)
      if (loop) return loop
    }
    path.pop()
    state.set(id, 2)
    return null
  }
  for (const n of nodes) {
    const loop = visit(n.id)
    if (loop) return loop
  }
  return null
}

const defaultNewId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

export function buildUpdatePlan(sheet: ParsedSheet, mapping: ColumnMapping, current: UpdateCurrent, options: UpdateOptions = {}): UpdatePlan {
  const newId = options.newId ?? defaultNewId
  const size = options.size ?? { w: 220, h: 80 }
  const removeLeavers = options.removeLeavers ?? true
  const file = buildImportPlan(sheet, mapping, {})
  const issues = [...file.issues]

  const nothing = (): UpdatePlan => ({
    issues, blocked: true, joiners: [], leavers: [], moves: [], edits: [], unchanged: 0, kept: current.nodes.length,
    matchedBy: { id: 0, email: 0, name: 0 }, hasChanges: false,
    result: { nodes: current.nodes, edges: current.edges, newDepartments: [] }, overLimit: null,
  })
  if (file.blocked) return nothing()

  // 1. Match rows to roles ---------------------------------------------------
  const byKey = new Map<string, OrgNode>()
  const byEmail = new Map<string, OrgNode>()
  const nameCount = new Map<string, number>()
  for (const n of current.nodes) {
    if (n.externalId && !byKey.has(lc(n.externalId))) byKey.set(lc(n.externalId), n)
    if (n.email && !byEmail.has(lc(n.email))) byEmail.set(lc(n.email), n)
    if (!n.externalId && !n.email && !isUnfilled(n)) nameCount.set(lc(n.name), (nameCount.get(lc(n.name)) ?? 0) + 1)
  }
  const byName = new Map<string, OrgNode>()
  for (const n of current.nodes) {
    if (!n.externalId && !n.email && !isUnfilled(n) && nameCount.get(lc(n.name)) === 1) byName.set(lc(n.name), n)
  }
  const fileVacant = (n: OrgNode) => isUnfilled(n)
  const fileNameCount = new Map<string, number>()
  for (const n of file.nodes) if (!fileVacant(n)) fileNameCount.set(lc(n.name), (fileNameCount.get(lc(n.name)) ?? 0) + 1)

  const matchOf = new Map<string, OrgNode>() // file node id → current role
  const claimedBy = new Map<string, string>() // current role id → file node id
  const matchedBy = { id: 0, email: 0, name: 0 }
  file.nodes.forEach((f, i) => {
    let hit: OrgNode | undefined
    let how: keyof typeof matchedBy = 'id'
    if (f.externalId && byKey.has(lc(f.externalId))) hit = byKey.get(lc(f.externalId))
    else if (f.email && byEmail.has(lc(f.email))) { hit = byEmail.get(lc(f.email)); how = 'email' }
    else if (!fileVacant(f) && fileNameCount.get(lc(f.name)) === 1 && byName.has(lc(f.name))) { hit = byName.get(lc(f.name)); how = 'name' }
    if (!hit) return
    const earlier = claimedBy.get(hit.id)
    if (earlier !== undefined) {
      issues.push({ row: null, severity: 'error', message: `Two rows in the file match the same role, ${roleLabel(hit)} (file rows ${file.nodes.findIndex(n => n.id === earlier) + 2} and ${i + 2}). Give each row its own ID or email.` })
      return
    }
    claimedBy.set(hit.id, f.id)
    matchOf.set(f.id, hit)
    matchedBy[how]++
  })
  if (issues.some(i => i.severity === 'error')) return nothing()

  // 2. Departments: by name, the chart's own first, then the workspace's; new names become new chart departments.
  const deptByName = new Map<string, Department>()
  for (const d of current.departments) if (!deptByName.has(lc(d.name))) deptByName.set(lc(d.name), d)
  const deptName = new Map(current.departments.map(d => [d.id, d.name]))
  const newDepartments: Department[] = []
  const fileDeptName = new Map(file.departments.map(d => [d.id, d]))
  const deptIdFor = (fileDeptId: string): string => {
    if (!fileDeptId) return ''
    const fd = fileDeptName.get(fileDeptId)!
    let d = deptByName.get(lc(fd.name))
    if (!d) {
      d = { id: newId('d'), name: fd.name, colour: fd.colour }
      deptByName.set(lc(fd.name), d)
      deptName.set(d.id, d.name)
      newDepartments.push(d)
    }
    return d.id
  }

  // 3. Roles: matched ones take the file's values for the columns it has; the rest are joiners.
  const has = (f: keyof ColumnMapping) => mapping[f] !== null
  const finalId = new Map<string, string>() // file node id → final role id
  for (const f of file.nodes) finalId.set(f.id, matchOf.get(f.id)?.id ?? newId('n'))

  const edits: UpdatePlan['edits'] = []
  const nextById = new Map<string, OrgNode>()
  const show = (field: ChangedField, n: OrgNode): string => {
    switch (field) {
      case 'department': return n.departmentId ? (deptName.get(n.departmentId) ?? '') : ''
      case 'roleType': return n.roleType ?? ''
      default: return String(n[field] ?? '')
    }
  }
  for (const f of file.nodes) {
    const cur = matchOf.get(f.id)
    if (!cur) continue
    const next: OrgNode = { ...cur }
    if (has('title')) next.title = f.title
    if (has('name')) {
      if (fileVacant(f)) {
        // Nobody holds the role any more: it stays, as an open role named after its title.
        next.name = next.title
        if (!isUnfilled(cur)) next.status = 'open'
      } else {
        next.name = f.name
        if (isUnfilled(cur)) next.status = 'active' // the open role was filled
      }
    } else if (isUnfilled(cur)) next.name = next.title // an open role is named after its title
    if (has('department')) next.departmentId = deptIdFor(f.departmentId)
    if (has('location')) next.location = f.location
    if (has('startDate')) next.startDate = f.startDate
    if (has('roleType')) next.roleType = f.roleType
    if (has('status')) next.status = f.status
    if (has('employmentType')) next.employmentType = f.employmentType
    if (f.externalId) next.externalId = f.externalId
    if (f.email) next.email = f.email
    const changes: FieldChange[] = []
    for (const field of Object.keys(CHANGED_FIELD_LABEL) as ChangedField[]) {
      const from = show(field, cur), to = show(field, next)
      if (from !== to) changes.push({ field, from, to })
    }
    if (changes.length) edits.push({ id: cur.id, label: roleLabel(next), changes })
    nextById.set(cur.id, next)
  }

  // 4. Leavers.
  const inFile = new Set([...matchOf.values()].map(n => n.id))
  const leavers: UpdatePlan['leavers'] = []
  const removed = new Set<string>()
  let kept = 0
  for (const n of current.nodes) {
    if (inFile.has(n.id)) continue
    const leaver = !!(n.externalId || n.email) || !isUnfilled(n)
    if (leaver) {
      leavers.push({ id: n.id, label: roleLabel(n), removed: removeLeavers })
      if (removeLeavers) { removed.add(n.id); continue }
    }
    kept++
    nextById.set(n.id, { ...n })
  }

  // 5. Reporting lines.
  const primary = primaryManagers(current.edges)
  let edges = current.edges.filter(e => !removed.has(e.sourceId) && !removed.has(e.targetId))
  const moves: UpdatePlan['moves'] = []
  const desiredOf = new Map<string, string | null>() // final role id → manager id (file roles only, when the file says)
  if (has('manager')) {
    for (const f of file.nodes) desiredOf.set(finalId.get(f.id)!, f.managerId ? finalId.get(f.managerId)! : null)
  }
  const currentById = new Map(current.nodes.map(n => [n.id, n]))
  const fileByFinal = new Map(file.nodes.map(f => [finalId.get(f.id)!, f]))
  const labelOf = (id: string | null | undefined) => {
    if (!id) return null
    const n = nextById.get(id) ?? currentById.get(id) ?? fileByFinal.get(id)
    return n ? roleLabel(n) : null
  }
  const existingIds = new Set(current.nodes.map(n => n.id))
  for (const [roleId, want] of desiredOf) {
    const isExisting = existingIds.has(roleId)
    const had = isExisting ? (primary.get(roleId) ?? null) : null
    if (isExisting && had === want) continue
    if (had) edges = edges.filter(e => !(e.targetId === roleId && e.sourceId === had))
    if (want && !edges.some(e => e.sourceId === want && e.targetId === roleId)) {
      edges.push({ id: newId('e'), sourceId: want, targetId: roleId })
    }
    if (isExisting) moves.push({ id: roleId, label: labelOf(roleId)!, from: labelOf(had), to: labelOf(want) })
  }

  // 6. Joiners, placed under their manager (managers first).
  const joinerFile = file.nodes.filter(f => !matchOf.has(f.id))
  const placed: OrgNode[] = [...nextById.values()]
  const joiners: UpdatePlan['joiners'] = []
  const pending = new Map(joinerFile.map(f => [finalId.get(f.id)!, f]))
  const depth = (id: string, seen = new Set<string>()): number => {
    const m = desiredOf.get(id)
    if (!m || seen.has(id)) return 0
    seen.add(id)
    return 1 + depth(m, seen)
  }
  const order = [...pending.keys()].sort((a, b) => depth(a) - depth(b))
  for (const id of order) {
    const f = pending.get(id)!
    const manager = desiredOf.get(id) ?? null
    const spot = manager ? placeUnderManager(manager, placed, edges, size) : null
    const right = placed.length ? Math.max(...placed.map(n => n.x)) + size.w + 160 : 60
    const top = placed.length ? Math.min(...placed.map(n => n.y)) : 50
    const node: OrgNode = {
      ...f, id, departmentId: deptIdFor(f.departmentId), managerId: manager,
      x: spot?.x ?? right, y: spot?.y ?? top,
    }
    placed.push(node)
    nextById.set(id, node)
    joiners.push({ id, label: roleLabel(node), manager: labelOf(manager) })
  }

  // managerId follows the first line in, as the canvas shows it.
  const firstIn = primaryManagers(edges)
  const nodes = [...nextById.values()].map(n => ({ ...n, managerId: firstIn.get(n.id) ?? null }))

  const loop = findLoop(nodes, edges)
  if (loop) {
    const names = loop.map(id => labelOf(id) ?? id)
    issues.push({ row: null, severity: 'error', message: `This update would make a reporting loop: ${[...names, names[0]].join(' → ')}. Check "Reports to" for these people, or a line drawn on the chart.` })
  }

  const max = options.maxNodes ?? -1
  let overLimit: UpdatePlan['overLimit'] = null
  if (max !== -1 && nodes.length > max && nodes.length > current.nodes.length) {
    overLimit = { max, wouldHave: nodes.length }
    issues.push({ row: null, severity: 'error', message: `After this update the chart would have ${nodes.length} roles, but your plan allows ${max} per chart. Nothing was changed.` })
  }

  const unchanged = [...matchOf.values()].filter(n => !edits.some(e => e.id === n.id) && !moves.some(m => m.id === n.id)).length
  const blocked = issues.some(i => i.severity === 'error')
  return {
    issues, blocked, joiners, leavers, moves, edits, unchanged, kept, matchedBy, overLimit,
    hasChanges: joiners.length + moves.length + edits.length + leavers.filter(l => l.removed).length > 0,
    result: { nodes, edges, newDepartments },
  }
}
