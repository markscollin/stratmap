import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, count, eq } from 'drizzle-orm'
import { requireAuth } from '../../../../_lib/auth'
import { requireRole, requireFeature, requireChartsEditable, getEffectivePlan, sendPlanLimit } from '../../../../_lib/access'
import { parseBody } from '../../../../_lib/validate'
import { SnapshotBranch } from '../../../../_lib/schemas'
import { branchSnapshot } from '../../../../_lib/snapshots'
import { logAudit } from '../../../../_lib/audit'
import { db } from '../../../../_lib/db'
import { charts, chartSnapshots, workspaceDepartments } from '../../../../../src/lib/db/schema'
import { fitsLimit } from '../../../../../src/lib/plans'

// POST /api/charts/:id/snapshots/:snapshotId/branch { name? } — a version becomes a NEW chart: this is how a scenario
// ("Plan B") is made. Same rules as creating a chart: editor and above, the plan's chart limit and role limit apply, and a
// workspace that is over its chart limit cannot add one. The original chart is not touched.
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
    const body = parseBody(SnapshotBranch, req, res)
    if (!body) return

    const [chart] = await db.select({ id: charts.id, name: charts.name }).from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId))).limit(1)
    if (!chart) return res.status(404).json({ error: 'Chart not found' })
    const [snapshot] = await db.select().from(chartSnapshots)
      .where(and(eq(chartSnapshots.id, snapshotId), eq(chartSnapshots.chartId, chartId))).limit(1)
    if (!snapshot) return res.status(404).json({ error: 'Version not found' })

    const plan = await getEffectivePlan(auth.workspaceId)
    if (!plan) return res.status(404).json({ error: 'Workspace not found' })
    const [{ value: chartCount }] = await db.select({ value: count() }).from(charts)
      .where(and(eq(charts.workspaceId, auth.workspaceId), eq(charts.isSample, false)))
    if (!fitsLimit(plan.limits.maxCharts, chartCount)) return sendPlanLimit(res, 'charts', plan, plan.limits.maxCharts)
    if (!fitsLimit(plan.limits.maxNodesPerChart, 0, snapshot.data.nodes.length)) return sendPlanLimit(res, 'nodes', plan, plan.limits.maxNodesPerChart)

    const workspaceDepts = await db.select({ id: workspaceDepartments.id }).from(workspaceDepartments).where(eq(workspaceDepartments.workspaceId, auth.workspaceId))
    const name = (body.name ?? `${chart.name} (${snapshot.name})`).slice(0, 100)
    const created = await branchSnapshot({
      workspaceId: auth.workspaceId, userId: auth.userId, name, data: snapshot.data,
      liveWorkspaceDepts: new Set(workspaceDepts.map(d => d.id)),
    })
    await logAudit({
      workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'chart.branched', targetType: 'chart', targetId: created.id,
      details: { chartName: created.name, versionName: snapshot.name },
    })
    return res.status(201).json(created)
  } catch (err) {
    console.error('/api/charts/[id]/snapshots/[snapshotId]/branch', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
