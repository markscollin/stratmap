import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { db } from '../_lib/db'
import { charts, nodes, edges, departments } from '../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const chartId = req.query.id as string

    // Verify chart belongs to this workspace
    const [chart] = await db
      .select()
      .from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId)))
      .limit(1)

    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    if (req.method === 'GET') {
      const [nodeList, edgeList, deptList] = await Promise.all([
        db.select().from(nodes).where(eq(nodes.chartId, chartId)),
        db.select().from(edges).where(eq(edges.chartId, chartId)),
        db.select().from(departments).where(eq(departments.chartId, chartId)),
      ])

      return res.json({
        ...chart,
        nodes: nodeList,
        edges: edgeList,
        departments: deptList,
      })
    }

    if (req.method === 'PUT') {
      const { name, status, isPublic } = req.body as { name?: string; status?: string; isPublic?: boolean }

      const [updated] = await db
        .update(charts)
        .set({
          ...(name !== undefined && { name }),
          ...(status !== undefined && { status: status as typeof charts.$inferInsert['status'] }),
          ...(isPublic !== undefined && { isPublic }),
          updatedAt: new Date(),
        })
        .where(eq(charts.id, chartId))
        .returning()

      return res.json(updated)
    }

    if (req.method === 'DELETE') {
      // Cascade deletes nodes/edges/departments via FK
      await db.delete(charts).where(eq(charts.id, chartId))
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
