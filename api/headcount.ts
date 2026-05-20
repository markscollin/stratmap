import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from './_lib/auth'
import { db } from './_lib/db'
import { headcountPlans, workspaceDepartments } from '../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    if (req.method === 'GET') {
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
      const { title, departmentId, roleType, targetQuarter, chartId, notes } = req.body as {
        title: string
        departmentId?: string
        roleType?: string
        targetQuarter: string
        chartId?: string
        notes?: string
      }

      if (!title || !targetQuarter) {
        return res.status(400).json({ error: 'title and targetQuarter are required' })
      }

      const [plan] = await db
        .insert(headcountPlans)
        .values({
          id: crypto.randomUUID(),
          workspaceId: auth.workspaceId,
          title,
          departmentId: departmentId ?? null,
          roleType: (roleType as 'new-headcount' | 'backfill' | 'contractor' | 'tbd' | 'existing') ?? 'new-headcount',
          targetQuarter,
          chartId: chartId ?? null,
          notes: notes ?? null,
          createdBy: auth.userId,
        })
        .returning()
      return res.status(201).json(plan)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/headcount', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
