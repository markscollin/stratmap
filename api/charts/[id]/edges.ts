import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { db } from '../../_lib/db'
import { charts, edges } from '../../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const chartId = req.query.id as string

    const [chart] = await db
      .select({ id: charts.id })
      .from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId)))
      .limit(1)

    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    if (req.method === 'POST') {
      const { sourceId, targetId } = req.body as { sourceId: string; targetId: string }
      if (!sourceId || !targetId) {
        return res.status(400).json({ error: 'sourceId and targetId are required' })
      }

      const [edge] = await db
        .insert(edges)
        .values({ id: crypto.randomUUID(), chartId, sourceId, targetId })
        .returning()

      await db.update(charts).set({ updatedAt: new Date() }).where(eq(charts.id, chartId))

      return res.status(201).json(edge)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/edges', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
