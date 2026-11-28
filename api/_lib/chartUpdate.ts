import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import { db } from './db'
import { applySnapshot, saveSnapshot } from './snapshots'
import { guardFailure } from './revision'
import { logAudit, type AuditAction } from './audit'
import { nodeOrder, edgeOrder } from './order'
import type { ChartSync } from './schemas'
import { MAX_SAMPLE_NODES } from './schemas'
import { nodes, edges, departments, workspaceDepartments, type SnapshotData } from '../../src/lib/db/schema'
import { buildUpdatePlan, type UpdatePlan } from '../../src/lib/updateFromFile'
import type { ColumnMapping, ParsedSheet } from '../../src/lib/importOrg'
import type { OrgNode, OrgEdge, Department } from '../../src/types'

// R-77/R-78: applying "the chart as it should be after an update" (from a file the person reviewed, or from an HR system).
// One path for both, so the rules cannot drift:
// - existing roles keep their position and photo whatever the body says; only the fields a file can carry change;
// - references are checked (a department must be the chart's, a new one, or the workspace's; a line's ends must be roles);
// - the plan's role limit applies when the chart grows (a sample chart's cap too);
// - the chart is saved as an automatic version first, and the update itself is the version-restore path (atomic, revision
//   claimed, removed roles to the 3-day trash with their comments and job descriptions).

export type ChartUpdateBody = z.infer<typeof ChartSync>

export type ChartUpdateOutcome =
  | { ok: true; roles: number; added: number; removed: number; changed: number }
  | { ok: false; reason: 'plan-limit' | 'sample-too-large' | 'chart-changed' | 'duplicate-ids' }

export async function applyChartUpdate(opts: {
  workspaceId: string
  chart: { id: string; name: string; isSample: boolean }
  body: ChartUpdateBody
  maxNodes: number
  /** The revision the client last saw (undefined: no check, e.g. the daily HR sync, which read the chart itself just before). */
  expectedRevision: number | undefined
  actor: string
  versionName: string
  audit: { action: AuditAction; extra?: Record<string, string | number | boolean | null> }
}): Promise<ChartUpdateOutcome> {
  const { workspaceId, chart, body } = opts
  const chartId = chart.id
  if (new Set(body.nodes.map(n => n.id)).size !== body.nodes.length) return { ok: false, reason: 'duplicate-ids' }

  const [currentNodes, chartDepts, wsDepts] = await Promise.all([
    db.select().from(nodes).where(eq(nodes.chartId, chartId)),
    db.select().from(departments).where(eq(departments.chartId, chartId)),
    db.select({ id: workspaceDepartments.id }).from(workspaceDepartments).where(eq(workspaceDepartments.workspaceId, workspaceId)),
  ])

  // Departments: every one the chart has, plus the new ones (a name the chart already has is reused, not doubled).
  const chartDeptByName = new Map(chartDepts.map(d => [d.name.toLowerCase(), d.id]))
  const deptAlias = new Map<string, string>()
  const added: SnapshotData['departments'] = []
  for (const d of body.departments) {
    const same = chartDeptByName.get(d.name.toLowerCase())
    if (same) { deptAlias.set(d.id, same); continue }
    if (chartDepts.some(c => c.id === d.id)) continue
    chartDeptByName.set(d.name.toLowerCase(), d.id)
    added.push({ id: d.id, name: d.name, colour: d.colour, workspaceDepartmentId: null })
  }
  const validDept = new Set([...chartDepts.map(d => d.id), ...added.map(d => d.id), ...wsDepts.map(d => d.id)])
  const deptOf = (id: string | null | undefined) => {
    const real = id ? (deptAlias.get(id) ?? id) : null
    return real && validDept.has(real) ? real : null
  }

  const before = new Map(currentNodes.map(n => [n.id, n]))
  const ids = new Set(body.nodes.map(n => n.id))
  const nextNodes: SnapshotData['nodes'] = body.nodes.map(n => {
    const fromFile = {
      name: n.name, title: n.title, departmentId: deptOf(n.departmentId), managerId: n.managerId && ids.has(n.managerId) ? n.managerId : null,
      status: n.status ?? 'active', employmentType: n.employmentType ?? 'full-time', roleType: n.roleType ?? null,
      location: n.location ?? null, startDate: n.startDate ?? null, externalId: n.externalId ?? null, email: n.email ?? null,
    }
    const old = before.get(n.id)
    if (old) {
      const { chartId: _c, ...row } = old
      return { ...row, ...fromFile }
    }
    return { id: n.id, ...fromFile, avatarUrl: null, x: n.x, y: n.y, isNew: false }
  })
  const seen = new Set<string>()
  const nextEdges: SnapshotData['edges'] = body.edges.filter(e => {
    const key = `${e.sourceId}>${e.targetId}`
    if (e.sourceId === e.targetId || !ids.has(e.sourceId) || !ids.has(e.targetId) || seen.has(key)) return false
    seen.add(key)
    return true
  })

  const grows = nextNodes.length > currentNodes.length
  if (grows && opts.maxNodes >= 0 && nextNodes.length > opts.maxNodes) return { ok: false, reason: 'plan-limit' }
  if (grows && chart.isSample && nextNodes.length > MAX_SAMPLE_NODES) return { ok: false, reason: 'sample-too-large' }

  await saveSnapshot({ workspaceId, chartId, name: opts.versionName, kind: 'auto', userId: opts.actor })
  const data: SnapshotData = {
    nodes: nextNodes,
    edges: nextEdges,
    departments: [...chartDepts.map(({ chartId: _c, ...d }) => d), ...added],
  }
  try {
    await applySnapshot(chartId, workspaceId, data, { claimRevision: { expected: opts.expectedRevision }, deletedBy: opts.actor })
  } catch (err) {
    if (guardFailure(err) === 'chart-changed') return { ok: false, reason: 'chart-changed' }
    throw err
  }

  const addedRoles = nextNodes.filter(n => !before.has(n.id)).length
  const removedRoles = currentNodes.filter(n => !ids.has(n.id)).length
  const fields = ['name', 'title', 'departmentId', 'status', 'employmentType', 'roleType', 'location', 'startDate'] as const
  const changedRoles = nextNodes.filter(n => {
    const old = before.get(n.id)
    return old && fields.some(f => (old[f] ?? null) !== (n[f] ?? null))
  }).length
  await logAudit({
    workspaceId, actorUserId: opts.actor, action: opts.audit.action, targetType: 'chart', targetId: chartId,
    details: { chartName: chart.name, added: addedRoles, removed: removedRoles, changed: changedRoles, ...opts.audit.extra },
  })
  return { ok: true, roles: nextNodes.length, added: addedRoles, removed: removedRoles, changed: changedRoles }
}

/** The chart as the update engine sees it: roles and lines in read order, the chart's departments then the workspace's. */
export async function readChartForUpdate(workspaceId: string, chartId: string): Promise<{ nodes: OrgNode[]; edges: OrgEdge[]; departments: Department[] }> {
  const [nodeRows, edgeRows, chartDepts, wsDepts] = await Promise.all([
    db.select().from(nodes).where(eq(nodes.chartId, chartId)).orderBy(...nodeOrder),
    db.select().from(edges).where(eq(edges.chartId, chartId)).orderBy(...edgeOrder),
    db.select().from(departments).where(eq(departments.chartId, chartId)),
    db.select().from(workspaceDepartments).where(eq(workspaceDepartments.workspaceId, workspaceId)),
  ])
  return {
    nodes: nodeRows.map(r => ({
      id: r.id, name: r.name, title: r.title, departmentId: r.departmentId ?? '', managerId: r.managerId, status: r.status,
      employmentType: r.employmentType, x: r.x, y: r.y,
      ...(r.roleType ? { roleType: r.roleType } : {}), ...(r.location ? { location: r.location } : {}),
      ...(r.startDate ? { startDate: r.startDate } : {}), ...(r.avatarUrl ? { avatarUrl: r.avatarUrl } : {}),
      externalId: r.externalId, email: r.email,
    })),
    edges: edgeRows.map(e => ({ id: e.id, sourceId: e.sourceId, targetId: e.targetId })),
    departments: [
      ...chartDepts.map(d => ({ id: d.id, name: d.name, colour: d.colour })),
      ...wsDepts.map(d => ({ id: d.id, name: d.name, colour: d.colour })),
    ],
  }
}

/** The update a table of people would make to a chart, worked out on the server (the HR sync never trusts a browser's diff). */
export async function planUpdateFromSheet(workspaceId: string, chartId: string, sheet: ParsedSheet, mapping: ColumnMapping, maxNodes: number): Promise<UpdatePlan> {
  const current = await readChartForUpdate(workspaceId, chartId)
  return buildUpdatePlan(sheet, mapping, current, { maxNodes })
}

/** The request body applyChartUpdate takes, from a plan. */
export function bodyFromPlan(plan: UpdatePlan): ChartUpdateBody {
  const { nodes: n, edges: e, newDepartments } = plan.result
  return {
    nodes: n.map(x => ({
      id: x.id, name: x.name, title: x.title, departmentId: x.departmentId || null, managerId: x.managerId,
      status: x.status, employmentType: x.employmentType, roleType: x.roleType ?? null, location: x.location ?? null,
      startDate: x.startDate ?? null, externalId: x.externalId ?? null, email: x.email ?? null, x: x.x, y: x.y,
    })),
    edges: e,
    departments: newDepartments,
  }
}
