import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { requireRole, atLeast, requireFeature } from '../_lib/access'
import { parseBody } from '../_lib/validate'
import { HeadcountUpdate, HEADCOUNT_SALARY_FIELDS } from '../_lib/schemas'
import { logAudit } from '../_lib/audit'
import { checkHeadcountReferences } from '../_lib/references'
import { db } from '../_lib/db'
import { headcountPlans } from '../../src/lib/db/schema'
import { headcountPlanLocked, APPROVED_PLAN_MESSAGE } from '../../src/lib/approvals'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const { id } = req.query as { id: string }

    if (req.method !== 'PUT' && req.method !== 'DELETE') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    // editor+ to change plans; approval additionally needs admin (below)
    const permission = await requireRole(auth, res, 'editor')
    if (!permission) return
    // Reading plans stays open (GET /api/headcount) so a downgraded workspace keeps its data.
    if (!(await requireFeature(auth.workspaceId, res, 'headcount-planning'))) return

    // D-7 (R-68): an approved hire is read-only for editors apart from its status (they may move it back to Planned on purpose).
    const [current] = await db.select({ status: headcountPlans.status }).from(headcountPlans)
      .where(and(eq(headcountPlans.id, id), eq(headcountPlans.workspaceId, auth.workspaceId))).limit(1)
    if (!current) return req.method === 'DELETE' ? res.status(204).end() : res.status(404).json({ error: 'Not found' }) // a delete is idempotent
    const locked = headcountPlanLocked(current.status, atLeast(permission, 'admin'))
    if (locked && req.method === 'DELETE') {
      return res.status(403).json({ error: 'approved-locked', required: 'admin', message: APPROVED_PLAN_MESSAGE })
    }

    if (req.method === 'PUT') {
      const body = parseBody(HeadcountUpdate, req, res)
      if (!body) return
      const { title, departmentId, roleType, targetQuarter, chartId, status, notes, salaryMin, salaryMax, salaryCurrency } = body
      if (locked && Object.entries(body).some(([k, v]) => k !== 'status' && v !== undefined)) {
        return res.status(403).json({ error: 'approved-locked', required: 'admin', message: APPROVED_PLAN_MESSAGE })
      }
      const touchesSalary = HEADCOUNT_SALARY_FIELDS.some(f => body[f] !== undefined)
      // Salary ranges are owner/admin only (same rule as job-description salary bands).
      if (touchesSalary && !atLeast(permission, 'admin')) {
        return res.status(403).json({ error: 'forbidden', required: 'admin', message: 'Only admins can change salary ranges' })
      }

      // Only admins+ can approve
      if (status === 'approved' && !atLeast(permission, 'admin')) {
        return res.status(403).json({ error: 'Only admins can approve headcount' })
      }

      // A department or chart that is being changed must belong to this workspace (R-30); an unchanged value is not re-checked.
      if (departmentId || chartId) {
        const [stored] = await db.select({ departmentId: headcountPlans.departmentId, chartId: headcountPlans.chartId }).from(headcountPlans)
          .where(and(eq(headcountPlans.id, id), eq(headcountPlans.workspaceId, auth.workspaceId))).limit(1)
        if (!stored) return res.status(404).json({ error: 'Not found' })
        if (!(await checkHeadcountReferences(res, auth.workspaceId, { departmentId, chartId }, stored))) return
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() }
      if (title !== undefined) updates.title = title
      if (departmentId !== undefined) updates.departmentId = departmentId
      if (roleType !== undefined) updates.roleType = roleType
      if (targetQuarter !== undefined) updates.targetQuarter = targetQuarter
      if (chartId !== undefined) updates.chartId = chartId
      if (status !== undefined) updates.status = status
      if (notes !== undefined) updates.notes = notes
      if (salaryMin !== undefined) updates.salaryMin = salaryMin
      if (salaryMax !== undefined) updates.salaryMax = salaryMax
      if (salaryCurrency !== undefined) updates.salaryCurrency = salaryCurrency

      // One bound may be sent alone, so check the result against what is stored.
      let before: typeof headcountPlans.$inferSelect | undefined
      if (touchesSalary) {
        ;[before] = await db.select().from(headcountPlans)
          .where(and(eq(headcountPlans.id, id), eq(headcountPlans.workspaceId, auth.workspaceId))).limit(1)
        if (!before) return res.status(404).json({ error: 'Not found' })
        const min = salaryMin !== undefined ? salaryMin : before.salaryMin
        const max = salaryMax !== undefined ? salaryMax : before.salaryMax
        if (min != null && max != null && min > max) {
          return res.status(400).json({ error: 'invalid-request', issues: [{ path: 'salaryMin', message: 'the minimum cannot be above the maximum' }] })
        }
      }

      const [updated] = await db
        .update(headcountPlans)
        .set(updates)
        .where(and(
          eq(headcountPlans.id, id),
          eq(headcountPlans.workspaceId, auth.workspaceId),
        ))
        .returning()

      if (!updated) return res.status(404).json({ error: 'Not found' })
      if (before) {
        const changed = HEADCOUNT_SALARY_FIELDS.filter(f => body[f] !== undefined && body[f] !== before![f])
        if (changed.length > 0) {
          await logAudit({
            workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'headcount.salary_updated',
            targetType: 'headcount', targetId: id, details: { planTitle: updated.title, changed: changed.join(',') },
          })
        }
      }
      // Editors never get salary fields back, even though they may edit the plan itself.
      const { salaryMin: _a, salaryMax: _b, salaryCurrency: _c, ...rest } = updated
      return res.json(atLeast(permission, 'admin') ? updated : rest)
    }

    if (req.method === 'DELETE') {
      await db
        .delete(headcountPlans)
        .where(and(
          eq(headcountPlans.id, id),
          eq(headcountPlans.workspaceId, auth.workspaceId),
        ))
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/headcount/[id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
