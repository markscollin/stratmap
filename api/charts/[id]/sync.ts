import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { requireRole, requireChartsEditable, getEffectivePlan, sendPlanLimit } from '../../_lib/access'
import { revisionStillCurrent, sentRevision, sendChartChanged, sendRevisionHeader } from '../../_lib/revision'
import { applyChartUpdate } from '../../_lib/chartUpdate'
import { parseBody } from '../../_lib/validate'
import { ChartSync, MAX_SAMPLE_NODES } from '../../_lib/schemas'
import { db } from '../../_lib/db'
import { charts } from '../../../src/lib/db/schema'

// POST /api/charts/:id/sync — R-77 "Update from file" (editor and above, every plan, like import).
//
// The browser read the file, matched its rows to the chart's roles and showed the person the changes (joiners, leavers,
// moves, edits; src/lib/updateFromFile.ts). It sends the chart as it should be afterwards. Here:
// - the client's revision must still be current (a structural edit made meanwhile is a 409, nothing changes);
// - existing roles keep their position and photo whatever the body says; only the fields a file can carry change;
// - references are checked: a department must be the chart's (or one created here) or the workspace's, a line's ends must be roles;
// - the plan's role limit applies when the chart grows;
// - the chart is saved as an automatic version first ("Before update from file"), and the update itself is the same atomic
//   restore path as version history (R-59/R-70): removed roles go to the 3-day trash with their comments and job descriptions.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const chartId = req.query.id as string
    const [chart] = await db.select({ id: charts.id, name: charts.name, isSample: charts.isSample }).from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId))).limit(1)
    if (!chart) return res.status(404).json({ error: 'Chart not found' })
    if (!(await requireRole(auth, res, 'editor'))) return
    if (!(await requireChartsEditable(auth.workspaceId, res))) return

    const body = parseBody(ChartSync, req, res)
    if (!body) return

    const plan = await getEffectivePlan(auth.workspaceId)
    if (!plan) return res.status(404).json({ error: 'Workspace not found' })
    if (!(await revisionStillCurrent(req, res, chartId))) return
    const outcome = await applyChartUpdate({
      workspaceId: auth.workspaceId, chart, body, maxNodes: plan.limits.maxNodesPerChart, expectedRevision: sentRevision(req),
      actor: auth.userId, versionName: 'Before update from file', audit: { action: 'chart.updated_from_file' },
    })
    if (!outcome.ok) {
      if (outcome.reason === 'chart-changed') { await sendChartChanged(res, chartId); return }
      if (outcome.reason === 'plan-limit') return sendPlanLimit(res, 'nodes', plan, plan.limits.maxNodesPerChart)
      if (outcome.reason === 'sample-too-large') return res.status(400).json({ error: 'sample-too-large', message: `A sample chart can have at most ${MAX_SAMPLE_NODES} roles.` })
      return res.status(400).json({ error: 'Duplicate role ids' })
    }
    await sendRevisionHeader(res, chartId)
    const { ok: _ok, ...counts } = outcome
    return res.json(counts)
  } catch (err) {
    console.error('/api/charts/[id]/sync', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
