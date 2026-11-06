import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and, count } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { track, hasAnalyticsConsent } from '../../_lib/analytics'
import { requireRole, getEffectivePlan, sendPlanLimit, requireChartsEditable } from '../../_lib/access'
import { parseBody } from '../../_lib/validate'
import { NodeCreate, NodePositions } from '../../_lib/schemas'
import { db } from '../../_lib/db'
import { charts, nodes } from '../../../src/lib/db/schema'
import { claimRevision } from '../../_lib/revision'
import { fitsLimit } from '../../../src/lib/plans'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const chartId = req.query.id as string

    const [chart] = await db
      .select({ id: charts.id, isSample: charts.isSample })
      .from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId)))
      .limit(1)

    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    if (req.method === 'POST') {
      if (!(await requireRole(auth, res, 'editor'))) return
      if (!(await requireChartsEditable(auth.workspaceId, res))) return
      const body = parseBody(NodeCreate, req, res)
      if (!body) return

      const plan = await getEffectivePlan(auth.workspaceId)
      if (!plan) return res.status(404).json({ error: 'Workspace not found' })
      const [{ value: nodeCount }] = await db
        .select({ value: count() })
        .from(nodes)
        .where(eq(nodes.chartId, chartId))
      if (!fitsLimit(plan.limits.maxNodesPerChart, nodeCount)) {
        return sendPlanLimit(res, 'nodes', plan, plan.limits.maxNodesPerChart)
      }

      // The client generates the id so it can draw edges optimistically; it is
      // validated (charset/length) and always scoped to this chart.
      if ((await claimRevision(req, res, chartId)) === null) return
      const [node] = await db
        .insert(nodes)
        .values({ ...body, id: body.id ?? crypto.randomUUID(), chartId })
        .returning()

      // Funnel: a chart reaches 10 roles through people adding them (not template seeding).
      if (!chart.isSample && nodeCount < 10 && nodeCount + 1 >= 10) {
        await track('ten_roles_reached', { userId: auth.userId, workspaceId: auth.workspaceId, consent: hasAnalyticsConsent(req), props: { plan: plan.tier } })
      }

      return res.status(201).json(node)
    }

    if (req.method === 'PUT') {
      // Bulk position update — used when saving canvas state after drag/auto-layout
      if (!(await requireRole(auth, res, 'editor'))) return
      if (!(await requireChartsEditable(auth.workspaceId, res))) return
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Expected array of { id, x, y }' })
      }
      const positions = parseBody(NodePositions, req, res)
      if (!positions) return

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
