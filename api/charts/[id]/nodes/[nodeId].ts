import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../../../_lib/auth'
import { db } from '../../../_lib/db'
import { charts, nodes } from '../../../../src/lib/db/schema'

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

    if (req.method === 'PUT') {
      const updates = req.body as Partial<typeof nodes.$inferInsert>
      const [updated] = await db
        .update(nodes)
        .set(updates)
        .where(and(eq(nodes.id, nodeId), eq(nodes.chartId, chartId)))
        .returning()

      if (!updated) return res.status(404).json({ error: 'Node not found' })

      await db.update(charts).set({ updatedAt: new Date() }).where(eq(charts.id, chartId))

      return res.json(updated)
    }

    if (req.method === 'DELETE') {
      await db.delete(nodes).where(and(eq(nodes.id, nodeId), eq(nodes.chartId, chartId)))
      await db.update(charts).set({ updatedAt: new Date() }).where(eq(charts.id, chartId))
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/nodes/[nodeId]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
