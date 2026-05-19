import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../../../_lib/auth'
import { db } from '../../../_lib/db'
import { charts, jobDescriptions } from '../../../../src/lib/db/schema'

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

    if (req.method === 'GET') {
      const [jd] = await db
        .select()
        .from(jobDescriptions)
        .where(and(eq(jobDescriptions.nodeId, nodeId), eq(jobDescriptions.chartId, chartId)))
        .limit(1)

      return jd ? res.json(jd) : res.status(404).json({ error: 'No JD found' })
    }

    if (req.method === 'PUT') {
      const body = req.body as Partial<typeof jobDescriptions.$inferInsert>

      const [existing] = await db
        .select({ id: jobDescriptions.id, version: jobDescriptions.version })
        .from(jobDescriptions)
        .where(and(eq(jobDescriptions.nodeId, nodeId), eq(jobDescriptions.chartId, chartId)))
        .limit(1)

      if (existing) {
        const [updated] = await db
          .update(jobDescriptions)
          .set({ ...body, version: existing.version + 1, updatedAt: new Date(), updatedBy: auth.userId })
          .where(eq(jobDescriptions.id, existing.id))
          .returning()
        return res.json(updated)
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

      return res.status(201).json(created)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/jd/[nodeId]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
