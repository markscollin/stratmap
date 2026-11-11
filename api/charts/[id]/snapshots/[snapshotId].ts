import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { requireAuth } from '../../../_lib/auth'
import { atLeast, getPermission } from '../../../_lib/access'
import { db } from '../../../_lib/db'
import { charts, chartSnapshots } from '../../../../src/lib/db/schema'

// GET    /api/charts/:id/snapshots/:snapshotId   one version with its contents (any member), for comparing
// DELETE /api/charts/:id/snapshots/:snapshotId   the person who saved it, or an admin or owner. Not a paid feature, so a
//                                               workspace that has downgraded can still tidy up.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const chartId = req.query.id as string
    const snapshotId = req.query.snapshotId as string

    const [chart] = await db.select({ id: charts.id }).from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId))).limit(1)
    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    const [snapshot] = await db.select().from(chartSnapshots)
      .where(and(eq(chartSnapshots.id, snapshotId), eq(chartSnapshots.chartId, chartId))).limit(1)
    if (!snapshot) return res.status(404).json({ error: 'Version not found' })

    if (req.method === 'GET') {
      return res.json({
        id: snapshot.id, name: snapshot.name, kind: snapshot.kind, createdAt: snapshot.createdAt.toISOString(),
        nodeCount: snapshot.nodeCount, edgeCount: snapshot.edgeCount, data: snapshot.data,
      })
    }

    if (req.method === 'DELETE') {
      const isAuthor = snapshot.createdBy === auth.userId
      if (!isAuthor && !atLeast((await getPermission(auth)) ?? 'viewer', 'admin')) {
        return res.status(403).json({ error: 'forbidden', required: 'admin', message: 'You can only delete versions you saved.' })
      }
      await db.delete(chartSnapshots).where(eq(chartSnapshots.id, snapshot.id))
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/snapshots/[snapshotId]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
