import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { db } from '../../_lib/db'
import { charts, nodes } from '../../../src/lib/db/schema'

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
      // Add a single node
      const body = req.body as typeof nodes.$inferInsert
      const [node] = await db
        .insert(nodes)
        .values({ ...body, id: body.id ?? crypto.randomUUID(), chartId })
        .returning()

      // Bump chart updatedAt
      await db.update(charts).set({ updatedAt: new Date() }).where(eq(charts.id, chartId))

      return res.status(201).json(node)
    }

    if (req.method === 'PUT') {
      // Bulk position update — used when saving canvas state after drag/auto-layout
      const positions = req.body as { id: string; x: number; y: number }[]
      if (!Array.isArray(positions)) {
        return res.status(400).json({ error: 'Expected array of { id, x, y }' })
      }

      await Promise.all(
        positions.map(({ id, x, y }) =>
          db.update(nodes).set({ x, y }).where(and(eq(nodes.id, id), eq(nodes.chartId, chartId)))
        )
      )

      await db.update(charts).set({ updatedAt: new Date() }).where(eq(charts.id, chartId))

      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/nodes', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
