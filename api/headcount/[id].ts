import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { db } from '../_lib/db'
import { headcountPlans, workspaceMembers } from '../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const { id } = req.query as { id: string }

    if (req.method === 'PUT') {
      const { title, departmentId, roleType, targetQuarter, chartId, status, notes } = req.body as {
        title?: string
        departmentId?: string | null
        roleType?: string
        targetQuarter?: string
        chartId?: string | null
        status?: 'planned' | 'approved' | 'filled'
        notes?: string | null
      }

      // Only admins+ can approve
      if (status === 'approved') {
        const [member] = await db
          .select({ permission: workspaceMembers.permission })
          .from(workspaceMembers)
          .where(and(
            eq(workspaceMembers.userId, auth.userId),
            eq(workspaceMembers.workspaceId, auth.workspaceId),
          ))
          .limit(1)

        const canApprove = member && ['owner', 'admin'].includes(member.permission)
        if (!canApprove) return res.status(403).json({ error: 'Only admins can approve headcount' })
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() }
      if (title !== undefined) updates.title = title
      if (departmentId !== undefined) updates.departmentId = departmentId
      if (roleType !== undefined) updates.roleType = roleType
      if (targetQuarter !== undefined) updates.targetQuarter = targetQuarter
      if (chartId !== undefined) updates.chartId = chartId
      if (status !== undefined) updates.status = status
      if (notes !== undefined) updates.notes = notes

      const [updated] = await db
        .update(headcountPlans)
        .set(updates)
        .where(and(
          eq(headcountPlans.id, id),
          eq(headcountPlans.workspaceId, auth.workspaceId),
        ))
        .returning()

      if (!updated) return res.status(404).json({ error: 'Not found' })
      return res.json(updated)
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
