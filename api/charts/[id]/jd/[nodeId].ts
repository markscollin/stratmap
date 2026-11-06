import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../../../_lib/auth'
import { getPermission, atLeast, type Permission, requireFeature, requireChartsEditable } from '../../../_lib/access'
import { parseBody } from '../../../_lib/validate'
import { JDUpdate, SALARY_FIELDS } from '../../../_lib/schemas'
import { db } from '../../../_lib/db'
import { logAudit } from '../../../_lib/audit'
import { charts, jobDescriptions, nodes } from '../../../../src/lib/db/schema'

// Salary bands are confidential: only admins/owners may read or write them.
function canSeeSalary(permission: Permission | null): boolean {
  return !!permission && atLeast(permission, 'admin')
}

function redactSalary<T extends Record<string, unknown>>(jd: T, permission: Permission | null): T {
  if (canSeeSalary(permission)) return jd
  const copy: Record<string, unknown> = { ...jd }
  for (const f of SALARY_FIELDS) delete copy[f]
  return copy as T
}

// Moving a JD into these states is an approval step (admin+), matching JDPanel.
const ADMIN_ONLY_STATUSES = new Set(['approved', 'published', 'hired'])

// Audit (roadmap 4.4): record THAT a salary band changed and which parts, never the amounts.
async function logSalaryChange(
  auth: { workspaceId: string; userId: string }, chartId: string, nodeId: string, changed: readonly string[],
) {
  if (changed.length === 0) return
  const [node] = await db.select({ title: nodes.title }).from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.chartId, chartId))).limit(1)
  await logAudit({
    workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'salary.updated',
    targetType: 'role', targetId: nodeId,
    details: { chartId, roleTitle: node?.title ?? null, changed: changed.join(',') },
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const chartId = req.query.id as string
    const nodeId = req.query.nodeId as string

    const [chart] = await db
      .select({ id: charts.id })
      .from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId)))
      .limit(1)

    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    const permission = await getPermission(auth)

    if (req.method === 'GET') {
      const [jd] = await db
        .select()
        .from(jobDescriptions)
        .where(and(eq(jobDescriptions.nodeId, nodeId), eq(jobDescriptions.chartId, chartId)))
        .limit(1)

      if (jd) return res.json(redactSalary(jd, permission))

      // No JD persisted yet — return a default so the client avoids a 404 console error
      return res.json({
        id: null,
        nodeId,
        chartId,
        status: 'draft',
        responsibilities: '',
        requirements: '',
        version: 1,
        updatedBy: '',
        updatedAt: new Date().toISOString(),
      })
    }

    if (req.method === 'PUT') {
      if (!permission || !atLeast(permission, 'editor')) {
        return res.status(403).json({ error: 'forbidden', required: 'editor' })
      }
      // Writing job descriptions is a paid feature. Reading stays open, so a
      // workspace that downgrades can still see the JDs it wrote.
      if (!(await requireFeature(auth.workspaceId, res, 'jd-editor'))) return
      if (!(await requireChartsEditable(auth.workspaceId, res))) return
      const body = parseBody(JDUpdate, req, res)
      if (!body) return
      if (body.status && body.status !== 'draft' && !(await requireFeature(auth.workspaceId, res, 'approval-workflow'))) return
      if (SALARY_FIELDS.some(f => body[f] !== undefined) && !canSeeSalary(permission)) {
        return res.status(403).json({ error: 'forbidden', required: 'admin', message: 'Only admins can edit salary bands' })
      }
      if (body.status && ADMIN_ONLY_STATUSES.has(body.status) && !atLeast(permission, 'admin')) {
        return res.status(403).json({ error: 'forbidden', required: 'admin', message: 'Only admins can approve job descriptions' })
      }

      const [existing] = await db
        .select({
          id: jobDescriptions.id, version: jobDescriptions.version,
          salaryBandMin: jobDescriptions.salaryBandMin, salaryBandMax: jobDescriptions.salaryBandMax, salaryCurrency: jobDescriptions.salaryCurrency,
        })
        .from(jobDescriptions)
        .where(and(eq(jobDescriptions.nodeId, nodeId), eq(jobDescriptions.chartId, chartId)))
        .limit(1)

      if (existing) {
        // Only bump version when explicitly requested (e.g. client passes higher version on draft revert)
        const version = body.version !== undefined ? body.version : existing.version
        const [updated] = await db
          .update(jobDescriptions)
          .set({ ...body, version, updatedAt: new Date(), updatedBy: auth.userId })
          .where(eq(jobDescriptions.id, existing.id))
          .returning()
        await logSalaryChange(auth, chartId, nodeId, SALARY_FIELDS.filter(f => body[f] !== undefined && body[f] !== (existing[f] ?? null)))
        return res.json(redactSalary(updated, permission))
      }

      const [created] = await db
        .insert(jobDescriptions)
        .values({
          id: crypto.randomUUID(),
          nodeId,
          chartId,
          status: 'draft',
          responsibilities: '',
          requirements: '',
          version: 1,
          updatedBy: auth.userId,
          ...body,
        })
        .returning()

      await logSalaryChange(auth, chartId, nodeId, SALARY_FIELDS.filter(f => body[f] !== undefined && body[f] !== null))
      return res.status(201).json(redactSalary(created, permission))
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/jd/[nodeId]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
