import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, count, eq } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { requireRole, requireChartsEditable, getEffectivePlan, sendPlanLimit } from '../../_lib/access'
import { captureChart, branchSnapshot } from '../../_lib/snapshots'
import { db } from '../../_lib/db'
import { charts, workspaceDepartments } from '../../../src/lib/db/schema'
import { fitsLimit } from '../../../src/lib/plans'

// POST /api/charts/:id/duplicate — "Duplicate chart" (launch review R-10). The copy has the same roles, reporting
// lines and departments under fresh ids, starts as a draft, is private, and counts as a new chart for the plan.
// Same rules as creating a chart: editor and above, the chart limit and the role limit apply, and a workspace over its
// chart limit cannot add one. Free on every plan (it is not version history). The original is not touched; comments,
// job descriptions and share links are not copied.
const NAME_MAX = 100
const SUFFIX = ' (copy)'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const chartId = req.query.id as string
    const [chart] = await db.select({ id: charts.id, name: charts.name }).from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId))).limit(1)
    if (!chart) return res.status(404).json({ error: 'Chart not found' })
    if (!(await requireRole(auth, res, 'editor'))) return
    if (!(await requireChartsEditable(auth.workspaceId, res))) return

    const plan = await getEffectivePlan(auth.workspaceId)
    if (!plan) return res.status(404).json({ error: 'Workspace not found' })
    // A sample chart does not count toward the limit, but its copy is an ordinary chart and does.
    const [{ value: chartCount }] = await db.select({ value: count() }).from(charts)
      .where(and(eq(charts.workspaceId, auth.workspaceId), eq(charts.isSample, false)))
    if (!fitsLimit(plan.limits.maxCharts, chartCount)) return sendPlanLimit(res, 'charts', plan, plan.limits.maxCharts)

    const data = await captureChart(chartId)
    if (!fitsLimit(plan.limits.maxNodesPerChart, 0, data.nodes.length)) return sendPlanLimit(res, 'nodes', plan, plan.limits.maxNodesPerChart)

    const workspaceDepts = await db.select({ id: workspaceDepartments.id }).from(workspaceDepartments)
      .where(eq(workspaceDepartments.workspaceId, auth.workspaceId))
    const created = await branchSnapshot({
      workspaceId: auth.workspaceId, userId: auth.userId,
      name: `${chart.name.slice(0, NAME_MAX - SUFFIX.length)}${SUFFIX}`, data,
      liveWorkspaceDepts: new Set(workspaceDepts.map(d => d.id)),
    })
    return res.status(201).json(created)
  } catch (err) {
    console.error('/api/charts/[id]/duplicate', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
