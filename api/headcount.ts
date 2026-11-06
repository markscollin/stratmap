import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from './_lib/auth'
import { requireRole, requireFeature, getPermission, atLeast } from './_lib/access'
import { logAudit } from './_lib/audit'
import { parseBody } from './_lib/validate'
import { HeadcountCreate, HEADCOUNT_SALARY_FIELDS } from './_lib/schemas'
import { db } from './_lib/db'
import { headcountPlans, workspaceDepartments } from '../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    if (req.method === 'GET') {
      // Salary ranges are confidential: only owners and admins ever receive them (same rule as job-description salary bands).
      const canSeeSalary = atLeast((await getPermission(auth)) ?? 'viewer', 'admin')
      const plans = await db
        .select({
          id: headcountPlans.id,
          workspaceId: headcountPlans.workspaceId,
          title: headcountPlans.title,
          departmentId: headcountPlans.departmentId,
          roleType: headcountPlans.roleType,
          targetQuarter: headcountPlans.targetQuarter,
          chartId: headcountPlans.chartId,
          status: headcountPlans.status,
          notes: headcountPlans.notes,
          ...(canSeeSalary ? {
            salaryMin: headcountPlans.salaryMin,
            salaryMax: headcountPlans.salaryMax,
            salaryCurrency: headcountPlans.salaryCurrency,
          } : {}),
          createdBy: headcountPlans.createdBy,
          createdAt: headcountPlans.createdAt,
          updatedAt: headcountPlans.updatedAt,
          departmentName: workspaceDepartments.name,
          departmentColour: workspaceDepartments.colour,
        })
        .from(headcountPlans)
        .leftJoin(workspaceDepartments, eq(headcountPlans.departmentId, workspaceDepartments.id))
        .where(eq(headcountPlans.workspaceId, auth.workspaceId))
      return res.json(plans)
    }

    if (req.method === 'POST') {
      const permission = await requireRole(auth, res, 'editor')
      if (!permission) return
      if (!(await requireFeature(auth.workspaceId, res, 'headcount-planning'))) return
      const body = parseBody(HeadcountCreate, req, res)
      if (!body) return
      const { title, departmentId, roleType, targetQuarter, chartId, notes, salaryMin, salaryMax, salaryCurrency } = body
      const setsSalary = HEADCOUNT_SALARY_FIELDS.some(f => body[f] != null)
      if (setsSalary && !atLeast(permission, 'admin')) {
        return res.status(403).json({ error: 'forbidden', required: 'admin', message: 'Only admins can set salary ranges' })
      }

      const [plan] = await db
        .insert(headcountPlans)
        .values({
          id: crypto.randomUUID(),
          workspaceId: auth.workspaceId,
          title,
          departmentId: departmentId ?? null,
          roleType,
          targetQuarter,
          chartId: chartId ?? null,
          notes: notes ?? null,
          salaryMin: salaryMin ?? null,
          salaryMax: salaryMax ?? null,
          salaryCurrency: salaryCurrency ?? null,
          createdBy: auth.userId,
        })
        .returning()
      if (setsSalary) {
        // Audit (roadmap 4.4): that a salary range was set, never the amounts.
        await logAudit({
          workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'headcount.salary_updated',
          targetType: 'headcount', targetId: plan.id, details: { planTitle: plan.title, changed: HEADCOUNT_SALARY_FIELDS.filter(f => body[f] != null).join(',') },
        })
      }
      // The creator is at least an editor; an editor never gets salary fields back.
      const { salaryMin: _a, salaryMax: _b, salaryCurrency: _c, ...rest } = plan
      return res.status(201).json(atLeast(permission, 'admin') ? plan : rest)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/headcount', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
