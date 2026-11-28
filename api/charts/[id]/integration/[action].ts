import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { requireAuth } from '../../../_lib/auth'
import { requireRole, requireFeature, requireChartsEditable } from '../../../_lib/access'
import { enforceRateLimit } from '../../../_lib/rateLimit'
import { revisionStillCurrent, sentRevision, sendChartChanged, sendRevisionHeader } from '../../../_lib/revision'
import { runHrSync, planSummary } from '../../../_lib/hrSync'
import { secretBoxReady } from '../../../_lib/secretBox'
import { db } from '../../../_lib/db'
import { charts, hrIntegrations } from '../../../../src/lib/db/schema'

// R-78: POST /api/charts/:id/integration/preview: what a sync would change now (nothing is written).
//       POST /api/charts/:id/integration/sync:    apply it now (structural: X-Chart-Revision is checked, like any edit).
// Editor and above, Growth and up. The update is worked out here from BambooHR's data, never taken from the browser.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const action = req.query.action
  if (action !== 'preview' && action !== 'sync') return res.status(404).json({ error: 'Not found' })
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const chartId = req.query.id as string
    const [chart] = await db.select({ id: charts.id }).from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId))).limit(1)
    if (!chart) return res.status(404).json({ error: 'Chart not found' })
    if (!(await requireRole(auth, res, 'editor'))) return
    if (!(await requireFeature(auth.workspaceId, res, 'hr-sync'))) return
    if (!(await requireChartsEditable(auth.workspaceId, res))) return
    const [integration] = await db.select().from(hrIntegrations).where(eq(hrIntegrations.chartId, chartId)).limit(1)
    if (!integration) return res.status(404).json({ error: 'not-connected', message: 'This chart is not connected to BambooHR.' })
    if (!secretBoxReady()) return res.status(503).json({ error: 'integrations-unavailable', message: 'HR connections are not set up on this server yet.' })
    // Every call reads the whole company from BambooHR.
    if (!(await enforceRateLimit(res, `hr-sync:${chartId}`, 30, 60 * 60))) return

    if (action === 'preview') {
      const run = await runHrSync(integration, { mode: 'preview', trigger: 'manual', actor: auth.userId })
      if (run.kind === 'result') return res.status(502).json({ error: 'bamboohr-failed', message: run.result.reason })
      return res.json(planSummary(run.plan))
    }

    if (!(await revisionStillCurrent(req, res, chartId))) return
    const run = await runHrSync(integration, { mode: 'apply', trigger: 'manual', actor: auth.userId, expectedRevision: sentRevision(req) })
    if (run.kind !== 'result') return res.status(500).json({ error: 'Internal server error' })
    if (run.chartChanged) { await sendChartChanged(res, chartId); return }
    if (run.result.status === 'ok') await sendRevisionHeader(res, chartId)
    if (run.result.status === 'failed') return res.status(run.planLimit ? 402 : 502).json({ error: run.planLimit ? 'plan-limit' : 'bamboohr-failed', message: run.result.reason, result: run.result })
    return res.json({ result: run.result })
  } catch (err) {
    console.error('/api/charts/[id]/integration/[action]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
