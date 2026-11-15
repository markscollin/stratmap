import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from './db'
import { chunk } from './chunk'
import { runAtomically } from './atomic'
import { charts, chartSnapshots, departments, edges, nodes, workspaceDepartments, type SnapshotData } from '../../src/lib/db/schema'

// Chart version history (roadmap 5): capturing a chart's structure, and putting a saved version back.
// A version holds roles, reporting lines and departments only: never job-description text or salary bands.

/** At most this many versions saved by people per chart; the app's own "before restore" ones are kept separately. */
export const MAX_MANUAL_SNAPSHOTS = 50
export const MAX_AUTO_SNAPSHOTS = 20

export async function captureChart(chartId: string): Promise<SnapshotData> {
  const [nodeRows, edgeRows, deptRows] = await Promise.all([
    db.select().from(nodes).where(eq(nodes.chartId, chartId)),
    db.select().from(edges).where(eq(edges.chartId, chartId)),
    db.select().from(departments).where(eq(departments.chartId, chartId)),
  ])
  return {
    nodes: nodeRows.map(({ chartId: _c, ...n }) => n),
    edges: edgeRows.map(({ chartId: _c, ...e }) => e),
    departments: deptRows.map(({ chartId: _c, ...d }) => d),
  }
}

/** Saves the chart's current structure as a version. Auto versions beyond the cap are pruned, oldest first. */
export async function saveSnapshot(opts: { workspaceId: string; chartId: string; name: string; kind: 'manual' | 'auto'; userId: string }) {
  const data = await captureChart(opts.chartId)
  const [row] = await db.insert(chartSnapshots).values({
    id: crypto.randomUUID(), workspaceId: opts.workspaceId, chartId: opts.chartId, name: opts.name, kind: opts.kind,
    createdBy: opts.userId, nodeCount: data.nodes.length, edgeCount: data.edges.length, data,
  }).returning({ id: chartSnapshots.id, createdAt: chartSnapshots.createdAt })

  if (opts.kind === 'auto') {
    const autos = await db.select({ id: chartSnapshots.id }).from(chartSnapshots)
      .where(and(eq(chartSnapshots.chartId, opts.chartId), eq(chartSnapshots.kind, 'auto')))
      .orderBy(desc(chartSnapshots.createdAt), desc(chartSnapshots.id))
    const surplus = autos.slice(MAX_AUTO_SNAPSHOTS).map(a => a.id)
    if (surplus.length > 0) await db.delete(chartSnapshots).where(inArray(chartSnapshots.id, surplus))
  }
  return row
}

export async function countManualSnapshots(chartId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(chartSnapshots)
    .where(and(eq(chartSnapshots.chartId, chartId), eq(chartSnapshots.kind, 'manual')))
  return row.n
}

/**
 * Role, line and department ids are primary keys across every workspace, and share pages show them. Someone could therefore
 * create a role with the id of one that was deleted from your chart, and a later restore would skip that role or fail on the
 * clash (R-31). Anything in the version whose id now belongs to another chart gets a fresh id here, with every reference to
 * it (manager, department, line ends) following. The role is restored; only its comments and job description, which are keyed
 * by the old id, do not come with it.
 */
export async function freeSquattedIds(chartId: string, data: SnapshotData): Promise<SnapshotData> {
  const taken = async (table: typeof nodes | typeof edges | typeof departments, ids: string[]) => {
    const found = new Set<string>()
    for (const part of chunk(ids)) {
      const rows = await db.select({ id: table.id }).from(table).where(and(inArray(table.id, part), sql`${table.chartId} <> ${chartId}`))
      for (const r of rows) found.add(r.id)
    }
    return found
  }
  const [nodeClash, edgeClash, deptClash] = await Promise.all([
    taken(nodes, data.nodes.map(n => n.id)), taken(edges, data.edges.map(e => e.id)), taken(departments, data.departments.map(d => d.id)),
  ])
  if (nodeClash.size + edgeClash.size + deptClash.size === 0) return data
  const fresh = (clash: Set<string>) => new Map([...clash].map(id => [id, crypto.randomUUID()]))
  const nodeIds = fresh(nodeClash), edgeIds = fresh(edgeClash), deptIds = fresh(deptClash)
  const n = (id: string) => nodeIds.get(id) ?? id
  const nn = (id: string | null) => (id ? n(id) : id)
  return {
    nodes: data.nodes.map(x => ({ ...x, id: n(x.id), managerId: nn(x.managerId), departmentId: x.departmentId ? (deptIds.get(x.departmentId) ?? x.departmentId) : x.departmentId })),
    edges: data.edges.map(e => ({ ...e, id: edgeIds.get(e.id) ?? e.id, sourceId: n(e.sourceId), targetId: n(e.targetId) })),
    departments: data.departments.map(d => ({ ...d, id: deptIds.get(d.id) ?? d.id })),
  }
}

/**
 * Puts a saved version back onto the chart, all or nothing. Roles that exist in both are UPDATED in place (so their
 * comments and job descriptions stay attached); roles only in the chart are removed; roles only in the version are
 * brought back (a job description written for them earlier re-attaches, since it is keyed by role id). Reporting lines
 * are replaced. The chart's name, status and sharing are not touched.
 */
export async function applySnapshot(chartId: string, workspaceId: string, snapshotData: SnapshotData): Promise<void> {
  const data = await freeSquattedIds(chartId, snapshotData)
  const [currentNodes, currentDepts, workspaceDepts] = await Promise.all([
    db.select({ id: nodes.id }).from(nodes).where(eq(nodes.chartId, chartId)),
    db.select({ id: departments.id }).from(departments).where(eq(departments.chartId, chartId)),
    db.select({ id: workspaceDepartments.id }).from(workspaceDepartments).where(eq(workspaceDepartments.workspaceId, workspaceId)),
  ])
  const keepNodes = new Set(data.nodes.map(n => n.id))
  const keepDepts = new Set(data.departments.map(d => d.id))
  const removeNodes = currentNodes.map(n => n.id).filter(id => !keepNodes.has(id))
  const removeDepts = currentDepts.map(d => d.id).filter(id => !keepDepts.has(id))
  // A department linked to a workspace department that has since been deleted would break the foreign key: unlink it.
  const liveWorkspaceDepts = new Set(workspaceDepts.map(d => d.id))

  await runAtomically(d => {
    const statements: PromiseLike<unknown>[] = [
      d.delete(edges).where(eq(edges.chartId, chartId)),
    ]
    for (const part of chunk(removeNodes)) statements.push(d.delete(nodes).where(and(eq(nodes.chartId, chartId), inArray(nodes.id, part))))
    for (const part of chunk(removeDepts)) statements.push(d.delete(departments).where(and(eq(departments.chartId, chartId), inArray(departments.id, part))))

    for (const part of chunk(data.departments)) {
      statements.push(d.insert(departments).values(part.map(dep => ({
        ...dep, chartId,
        workspaceDepartmentId: dep.workspaceDepartmentId && liveWorkspaceDepts.has(dep.workspaceDepartmentId) ? dep.workspaceDepartmentId : null,
      }))).onConflictDoUpdate({
        target: departments.id,
        set: { name: sql`excluded.name`, colour: sql`excluded.colour`, workspaceDepartmentId: sql`excluded.workspace_department_id` },
        setWhere: eq(departments.chartId, chartId),
      }))
    }
    for (const part of chunk(data.nodes)) {
      statements.push(d.insert(nodes).values(part.map(n => ({ ...n, chartId }))).onConflictDoUpdate({
        target: nodes.id,
        set: {
          name: sql`excluded.name`, title: sql`excluded.title`, departmentId: sql`excluded.department_id`, managerId: sql`excluded.manager_id`,
          status: sql`excluded.status`, employmentType: sql`excluded.employment_type`, roleType: sql`excluded.role_type`,
          avatarUrl: sql`excluded.avatar_url`, location: sql`excluded.location`, startDate: sql`excluded.start_date`,
          x: sql`excluded.x`, y: sql`excluded.y`, isNew: sql`excluded.is_new`,
        },
        setWhere: eq(nodes.chartId, chartId),
      }))
    }
    for (const part of chunk(data.edges)) statements.push(d.insert(edges).values(part.map(e => ({ ...e, chartId }))))
    return statements
  })
}

/** Creates a NEW chart (fresh ids everywhere) from a saved version, all or nothing. Returns the new chart's row. */
export async function branchSnapshot(opts: { workspaceId: string; userId: string; name: string; data: SnapshotData; liveWorkspaceDepts: Set<string> }) {
  const chartId = crypto.randomUUID()
  const deptIds = new Map(opts.data.departments.map(dep => [dep.id, crypto.randomUUID()]))
  const nodeIds = new Map(opts.data.nodes.map(n => [n.id, crypto.randomUUID()]))
  const chartRow = { id: chartId, workspaceId: opts.workspaceId, name: opts.name, status: 'draft' as const, version: 1, ownerId: opts.userId, creatorId: opts.userId }

  await runAtomically(d => {
    const statements: PromiseLike<unknown>[] = [d.insert(charts).values(chartRow)]
    for (const part of chunk(opts.data.departments)) {
      statements.push(d.insert(departments).values(part.map(dep => ({
        id: deptIds.get(dep.id)!, chartId, name: dep.name, colour: dep.colour,
        workspaceDepartmentId: dep.workspaceDepartmentId && opts.liveWorkspaceDepts.has(dep.workspaceDepartmentId) ? dep.workspaceDepartmentId : null,
      }))))
    }
    for (const part of chunk(opts.data.nodes)) {
      statements.push(d.insert(nodes).values(part.map(n => ({
        ...n, id: nodeIds.get(n.id)!, chartId,
        departmentId: n.departmentId ? (deptIds.get(n.departmentId) ?? null) : null,
        managerId: n.managerId ? (nodeIds.get(n.managerId) ?? null) : null,
      }))))
    }
    const lines = opts.data.edges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
    for (const part of chunk(lines)) {
      statements.push(d.insert(edges).values(part.map(e => ({ id: crypto.randomUUID(), chartId, sourceId: nodeIds.get(e.sourceId)!, targetId: nodeIds.get(e.targetId)! }))))
    }
    return statements
  })
  const [chart] = await db.select().from(charts).where(eq(charts.id, chartId)).limit(1)
  return chart
}

