import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, desc, eq } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { requireRole, requireFeature } from '../../_lib/access'
import { parseBody } from '../../_lib/validate'
import { SnapshotCreate } from '../../_lib/schemas'
import { enforceRateLimit } from '../../_lib/rateLimit'
import { countManualSnapshots, saveSnapshot, MAX_MANUAL_SNAPSHOTS } from '../../_lib/snapshots'
import { db } from '../../_lib/db'
import { charts, chartSnapshots, workspaceMembers } from '../../../src/lib/db/schema'

// Chart version history (roadmap 5).
//   GET  /api/charts/:id/snapshots   the saved versions, newest first, without their contents (any member; stays readable after a downgrade)
//   POST /api/charts/:id/snapshots   { name } save the chart as it is now (editor and above, Growth plan)
// Saving a version is not a chart edit: it works on a chart that is view-only because of the plan, and never bumps the revision.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const chartId = req.query.id as string

    const [chart] = await db.select({ id: charts.id }).from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId))).limit(1)
    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    if (req.method === 'GET') {
      const [rows, members] = await Promise.all([
        db.select({
          id: chartSnapshots.id, name: chartSnapshots.name, kind: chartSnapshots.kind, createdBy: chartSnapshots.createdBy,
          createdAt: chartSnapshots.createdAt, nodeCount: chartSnapshots.nodeCount, edgeCount: chartSnapshots.edgeCount,
        }).from(chartSnapshots).where(eq(chartSnapshots.chartId, chartId)).orderBy(desc(chartSnapshots.createdAt), desc(chartSnapshots.id)),
        db.select({ userId: workspaceMembers.userId, name: workspaceMembers.name, email: workspaceMembers.email })
          .from(workspaceMembers).where(eq(workspaceMembers.workspaceId, auth.workspaceId)),
      ])
      const names = new Map(members.map(m => [m.userId, m.name || m.email || null]))
      return res.json({
        snapshots: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), authorName: names.get(r.createdBy) ?? null })),
        limit: MAX_MANUAL_SNAPSHOTS,
      })
    }

    if (req.method === 'POST') {
      if (!(await requireRole(auth, res, 'editor'))) return
      if (!(await requireFeature(auth.workspaceId, res, 'version-history'))) return
      if (!(await enforceRateLimit(res, `snapshot:${auth.userId}`, 20, 60))) return
      const body = parseBody(SnapshotCreate, req, res)
      if (!body) return
      if ((await countManualSnapshots(chartId)) >= MAX_MANUAL_SNAPSHOTS) {
        return res.status(409).json({
          error: 'snapshot-limit',
          message: `A chart can keep ${MAX_MANUAL_SNAPSHOTS} saved versions. Delete an old one to save a new one.`,
        })
      }
      const saved = await saveSnapshot({ workspaceId: auth.workspaceId, chartId, name: body.name, kind: 'manual', userId: auth.userId })
      return res.status(201).json({ id: saved.id, createdAt: saved.createdAt.toISOString() })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/snapshots', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
