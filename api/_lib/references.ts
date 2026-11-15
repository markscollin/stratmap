import type { VercelResponse } from '@vercel/node'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from './db'
import { charts, departments, nodes, workspaceDepartments } from '../../src/lib/db/schema'

// Ids that arrive in a request body and point at other rows (a department, a manager, a chart) must belong to the caller's
// workspace (R-30). The ids are unguessable UUIDs, so this is defence in depth, but it also stops a request from linking its
// data to a row it cannot see, and from storing ids that mean nothing.

export type ReferenceField = 'departmentId' | 'managerId' | 'chartId'

function invalid(res: VercelResponse, field: ReferenceField): false {
  res.status(400).json({ error: 'invalid-reference', field, message: `That ${field.replace('Id', '')} does not exist in this workspace.` })
  return false
}

const isSet = (v: unknown): v is string => typeof v === 'string' && v !== ''

/**
 * Checks the references of a role that is being created or changed. A department is valid if it is one of this workspace's
 * departments or one of this chart's own; a manager must be a role in this chart. On an edit a value that is unchanged is
 * not checked again, so a role whose old manager was deleted can still be edited (the stale value is simply re-sent).
 * Sends 400 `invalid-reference` and returns false when something does not belong.
 */
export async function checkRoleReferences(
  res: VercelResponse,
  ctx: { workspaceId: string; chartId: string },
  fields: { departmentId?: string | null; managerId?: string | null },
  current?: { departmentId: string | null; managerId: string | null } | null,
): Promise<boolean> {
  const dept = fields.departmentId
  if (isSet(dept) && dept !== current?.departmentId) {
    const [wsDept] = await db.select({ id: workspaceDepartments.id }).from(workspaceDepartments)
      .where(and(eq(workspaceDepartments.id, dept), eq(workspaceDepartments.workspaceId, ctx.workspaceId))).limit(1)
    if (!wsDept) {
      const [chartDept] = await db.select({ id: departments.id }).from(departments)
        .where(and(eq(departments.id, dept), eq(departments.chartId, ctx.chartId))).limit(1)
      if (!chartDept) return invalid(res, 'departmentId')
    }
  }
  const manager = fields.managerId
  if (isSet(manager) && manager !== current?.managerId) {
    const [m] = await db.select({ id: nodes.id }).from(nodes).where(and(eq(nodes.id, manager), eq(nodes.chartId, ctx.chartId))).limit(1)
    if (!m) return invalid(res, 'managerId')
  }
  return true
}

/** For headcount plans: the department must be this workspace's, the chart one of this workspace's charts. Unchanged values are skipped. */
export async function checkHeadcountReferences(
  res: VercelResponse,
  workspaceId: string,
  fields: { departmentId?: string | null; chartId?: string | null },
  current?: { departmentId: string | null; chartId: string | null } | null,
): Promise<boolean> {
  const { departmentId, chartId } = fields
  if (isSet(departmentId) && departmentId !== current?.departmentId) {
    const [d] = await db.select({ id: workspaceDepartments.id }).from(workspaceDepartments)
      .where(and(eq(workspaceDepartments.id, departmentId), eq(workspaceDepartments.workspaceId, workspaceId))).limit(1)
    if (!d) return invalid(res, 'departmentId')
  }
  if (isSet(chartId) && chartId !== current?.chartId) {
    const [c] = await db.select({ id: charts.id }).from(charts).where(and(eq(charts.id, chartId), eq(charts.workspaceId, workspaceId))).limit(1)
    if (!c) return invalid(res, 'chartId')
  }
  return true
}

/** Of these workspace-department ids, the ones that really belong to the workspace (for template seeding, which drops the others instead of failing). */
export async function liveWorkspaceDepartmentIds(workspaceId: string, ids: (string | null | undefined)[]): Promise<Set<string>> {
  const wanted = [...new Set(ids.filter(isSet))]
  if (wanted.length === 0) return new Set()
  const rows = await db.select({ id: workspaceDepartments.id }).from(workspaceDepartments)
    .where(and(eq(workspaceDepartments.workspaceId, workspaceId), inArray(workspaceDepartments.id, wanted)))
  return new Set(rows.map(r => r.id))
}
