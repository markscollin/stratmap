import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../../../_lib/auth'
import { requireRole, requireChartsEditable } from '../../../_lib/access'
import { writeWithRevision } from '../../../_lib/revision'
import { db } from '../../../_lib/db'
import { charts, edges } from '../../../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const chartId = req.query.id as string
    const edgeId = req.query.edgeId as string

    const [chart] = await db
      .select({ id: charts.id })
      .from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId)))
      .limit(1)

    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    if (req.method === 'DELETE') {
      if (!(await requireRole(auth, res, 'editor'))) return
      if (!(await requireChartsEditable(auth.workspaceId, res))) return
      // Already gone (a retried delete): done, without claiming a revision (R-70).
      const [line] = await db.select({ id: edges.id }).from(edges).where(and(eq(edges.id, edgeId), eq(edges.chartId, chartId))).limit(1)
      if (!line) return res.status(204).end()
      const refused = await writeWithRevision(req, res, chartId, d => [d.delete(edges).where(and(eq(edges.id, edgeId), eq(edges.chartId, chartId)))])
      if (refused) return
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/edges/[edgeId]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
