import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from './db'
import { chunk } from './chunk'
import { runAtomically } from './atomic'
import { nodeOrder, edgeOrder } from './order'
import { charts, chartSnapshots, departments, edges, nodes, workspaceDepartments, roleComments, jobDescriptions, deletedNodes, type SnapshotData } from '../../src/lib/db/schema'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { trashCutoff } from './nodeTrash'

/** Dates in a trash copy come back from jsonb as strings. */
const asDate = (v: unknown): Date | null => (v ? new Date(v as string) : null)

// Chart version history (roadmap 5): capturing a chart's structure, and putting a saved version back.
// A version holds roles, reporting lines and departments only: never job-description text or salary bands.

/** At most this many versions saved by people per chart; the app's own "before restore" ones are kept separately. */
export const MAX_MANUAL_SNAPSHOTS = 50
export const MAX_AUTO_SNAPSHOTS = 20
/** Daily versions kept per chart (the app takes one a day when the chart changed); older ones are pruned. */
export const MAX_SCHEDULED_SNAPSHOTS = 14

export type SnapshotKind = 'manual' | 'auto' | 'scheduled'

export async function captureChart(chartId: string): Promise<SnapshotData> {
  const [nodeRows, edgeRows, deptRows] = await Promise.all([
    db.select().from(nodes).where(eq(nodes.chartId, chartId)).orderBy(...nodeOrder),
    db.select().from(edges).where(eq(edges.chartId, chartId)).orderBy(...edgeOrder),
    db.select().from(departments).where(eq(departments.chartId, chartId)),
  ])
  return {
    nodes: nodeRows.map(({ chartId: _c, ...n }) => n),
    edges: edgeRows.map(({ chartId: _c, ...e }) => e),
    departments: deptRows.map(({ chartId: _c, ...d }) => d),
  }
}

/** Saves the chart's current structure as a version. Automatic versions beyond their cap are pruned, oldest first. */
export async function saveSnapshot(opts: { workspaceId: string; chartId: string; name: string; kind: SnapshotKind; userId: string; createdAt?: Date }) {
  const data = await captureChart(opts.chartId)
  const [row] = await db.insert(chartSnapshots).values({
    id: crypto.randomUUID(), workspaceId: opts.workspaceId, chartId: opts.chartId, name: opts.name, kind: opts.kind,
    createdBy: opts.userId, nodeCount: data.nodes.length, edgeCount: data.edges.length, data,
    // A job that takes a clock (the daily versions) stamps the version with it, so its "how long since the last one" check compares like with like.
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  }).returning({ id: chartSnapshots.id, createdAt: chartSnapshots.createdAt })

  if (opts.kind !== 'manual') {
    // Each automatic kind has its own allowance, so daily versions never push out the "before restore" ones (or the reverse).
    const keep = opts.kind === 'auto' ? MAX_AUTO_SNAPSHOTS : MAX_SCHEDULED_SNAPSHOTS
    const autos = await db.select({ id: chartSnapshots.id }).from(chartSnapshots)
      .where(and(eq(chartSnapshots.chartId, opts.chartId), eq(chartSnapshots.kind, opts.kind)))
      .orderBy(desc(chartSnapshots.createdAt), desc(chartSnapshots.id))
    const surplus = autos.slice(keep).map(a => a.id)
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

  // R-67: a role the restore removes goes into the deleted-role trash with its comments, lines and job descriptions, exactly like
  // a role delete (it used to lose its comments at once and leave its JDs to the orphan purge). A role the restore brings back
  // takes its comments and JDs back out of the trash, so restoring the "Before restoring" version gives back everything.
  const currentIds = new Set(currentNodes.map(n => n.id))
  const returning = data.nodes.map(n => n.id).filter(id => !currentIds.has(id))
  const [removedRows, removedComments, removedJds, removedLines, trashed] = await Promise.all([
    readIn(nodes, removeNodes, chartId),
    readIn(roleComments, removeNodes, chartId, roleComments.nodeId),
    readIn(jobDescriptions, removeNodes, chartId, jobDescriptions.nodeId),
    db.select().from(edges).where(eq(edges.chartId, chartId)),
    returning.length
      ? readIn(deletedNodes, returning, chartId, deletedNodes.nodeId).then(rows => rows.filter(r => r.deletedAt > trashCutoff()))
      : Promise.resolve([] as (typeof deletedNodes.$inferSelect)[]),
  ])
  const deletedBy = 'system:restore'
  const copies = removedRows.map(node => ({
    id: crypto.randomUUID(), chartId, nodeId: node.id, deletedBy, deletedAt: new Date(),
    data: {
      node,
      comments: removedComments.filter(c => c.nodeId === node.id),
      edges: removedLines.filter(e => e.sourceId === node.id || e.targetId === node.id),
      jobDescriptions: removedJds.filter(j => j.nodeId === node.id),
    },
  }))
  const commentsBack = trashed.flatMap(t => t.data.comments ?? [])
    .sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId)) // a thread's first comment before its replies
  const jdsBack = trashed.flatMap(t => t.data.jobDescriptions ?? [])

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

    // The removed roles' copies (the role rows are already gone above; their JDs go now, their comments went with the role).
    for (const part of chunk(removeNodes)) statements.push(d.delete(jobDescriptions).where(and(eq(jobDescriptions.chartId, chartId), inArray(jobDescriptions.nodeId, part))))
    for (const part of chunk(copies)) {
      statements.push(d.insert(deletedNodes).values(part).onConflictDoUpdate({
        target: [deletedNodes.chartId, deletedNodes.nodeId],
        set: { id: sql`excluded.id`, deletedBy: sql`excluded.deleted_by`, deletedAt: sql`excluded.deleted_at`, data: sql`excluded.data` },
      }))
    }
    // Returning roles get their discussion and job descriptions back, and their trash copy is used up.
    for (const part of chunk(commentsBack)) {
      statements.push(d.insert(roleComments).values(part.map(c => ({
        ...c, createdAt: new Date(c.createdAt), editedAt: asDate(c.editedAt),
        deletedAt: asDate(c.deletedAt), resolvedAt: asDate(c.resolvedAt),
      }))).onConflictDoNothing())
    }
    for (const part of chunk(jdsBack)) {
      statements.push(d.insert(jobDescriptions).values(part.map(j => ({ ...j, updatedAt: new Date(j.updatedAt) }))).onConflictDoNothing())
    }
    if (trashed.length) statements.push(d.delete(deletedNodes).where(inArray(deletedNodes.id, trashed.map(t => t.id))))
    return statements
  })
}

/** Rows of `table` in this chart whose `column` (default: id) is one of `ids`, read in chunks. */
async function readIn<T extends typeof nodes | typeof roleComments | typeof jobDescriptions | typeof deletedNodes>(
  table: T, ids: string[], chartId: string, column?: AnyPgColumn,
): Promise<T['$inferSelect'][]> {
  const out: T['$inferSelect'][] = []
  const t = table as unknown as typeof nodes
  for (const part of chunk(ids)) {
    const rows = await db.select().from(t).where(and(eq(t.chartId, chartId), inArray(column ?? t.id, part)))
    out.push(...(rows as unknown as T['$inferSelect'][]))
  }
  return out
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

