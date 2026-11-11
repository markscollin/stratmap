import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { requireAuth } from '../../../../_lib/auth'
import { requireRole, requireFeature, requireChartsEditable, getEffectivePlan, sendPlanLimit } from '../../../../_lib/access'
import { claimRevision } from '../../../../_lib/revision'
import { applySnapshot, saveSnapshot } from '../../../../_lib/snapshots'
import { logAudit } from '../../../../_lib/audit'
import { db } from '../../../../_lib/db'
import { charts, chartSnapshots } from '../../../../../src/lib/db/schema'
import { fitsLimit } from '../../../../../src/lib/plans'

// POST /api/charts/:id/snapshots/:snapshotId/restore — puts an earlier version back (editor and above, Growth plan).
// It is a structural edit like any other (the chart revision goes up, and a stale client gets 409), the app first saves
// the chart as it is now ("Before restoring …") so the restore can itself be undone, and it is all or nothing.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const chartId = req.query.id as string
    const snapshotId = req.query.snapshotId as string
    if (!(await requireRole(auth, res, 'editor'))) return
    if (!(await requireFeature(auth.workspaceId, res, 'version-history'))) return
    if (!(await requireChartsEditable(auth.workspaceId, res))) return

    const [chart] = await db.select({ id: charts.id, name: charts.name }).from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId))).limit(1)
    if (!chart) return res.status(404).json({ error: 'Chart not found' })
    const [snapshot] = await db.select().from(chartSnapshots)
      .where(and(eq(chartSnapshots.id, snapshotId), eq(chartSnapshots.chartId, chartId))).limit(1)
    if (!snapshot) return res.status(404).json({ error: 'Version not found' })

    // A version saved on a bigger plan may hold more roles than this plan allows.
    const plan = await getEffectivePlan(auth.workspaceId)
    if (!plan) return res.status(404).json({ error: 'Workspace not found' })
    if (!fitsLimit(plan.limits.maxNodesPerChart, 0, snapshot.data.nodes.length)) {
      return sendPlanLimit(res, 'nodes', plan, plan.limits.maxNodesPerChart)
    }

    // Last check before changing anything: is this client looking at the latest chart?
    if ((await claimRevision(req, res, chartId)) === null) return

    await saveSnapshot({ workspaceId: auth.workspaceId, chartId, name: `Before restoring “${snapshot.name}”`.slice(0, 100), kind: 'auto', userId: auth.userId })
    await applySnapshot(chartId, auth.workspaceId, snapshot.data)
    await logAudit({
      workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'chart.restored', targetType: 'chart', targetId: chartId,
      details: { chartName: chart.name, versionName: snapshot.name },
    })
    return res.json({ restored: true, roles: snapshot.data.nodes.length })
  } catch (err) {
    console.error('/api/charts/[id]/snapshots/[snapshotId]/restore', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
