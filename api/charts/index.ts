import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, desc, count, sql, getTableColumns } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { track, hasAnalyticsConsent } from '../_lib/analytics'
import { requireRole, requireFeature, getEffectivePlan, sendPlanLimit } from '../_lib/access'
import { parseBody } from '../_lib/validate'
import { ChartCreate } from '../_lib/schemas'
import { db } from '../_lib/db'
import { chunk } from '../_lib/chunk'
import { charts, nodes, edges, departments } from '../../src/lib/db/schema'
import { fitsLimit, APPROVAL_CHART_STATUSES } from '../../src/lib/plans'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    if (req.method === 'GET') {
      const chartList = await db
        .select({
          ...getTableColumns(charts),
          // Counts for the library cards, which don't load each chart's nodes.
          // Fully qualified on purpose: drizzle renders column refs unqualified in a
          // select list, which would bind "id" to the inner table.
          nodeCount: sql<number>`(select count(*)::int from "nodes" n where n."chart_id" = "charts"."id")`,
          deptCount: sql<number>`(select count(*)::int from "departments" d where d."chart_id" = "charts"."id")`,
        })
        .from(charts)
        .where(eq(charts.workspaceId, auth.workspaceId))
        .orderBy(desc(charts.updatedAt))

      return res.json(chartList)
    }

    if (req.method === 'POST') {
      if (!(await requireRole(auth, res, 'editor'))) return
      const body = parseBody(ChartCreate, req, res)
      if (!body) return
      const { name, status = 'draft', templateNodes, templateEdges, templateDepts } = body
      if ((APPROVAL_CHART_STATUSES as readonly string[]).includes(status)
        && !(await requireFeature(auth.workspaceId, res, 'approval-workflow'))) return

      // Plan limits: chart count, and node count of the seeded template.
      const plan = await getEffectivePlan(auth.workspaceId)
      if (!plan) return res.status(404).json({ error: 'Workspace not found' })
      const [{ value: chartCount }] = await db
        .select({ value: count() })
        .from(charts)
        .where(eq(charts.workspaceId, auth.workspaceId))
      if (!fitsLimit(plan.limits.maxCharts, chartCount)) {
        return sendPlanLimit(res, 'charts', plan, plan.limits.maxCharts)
      }
      if (!fitsLimit(plan.limits.maxNodesPerChart, 0, templateNodes.length)) {
        return sendPlanLimit(res, 'nodes', plan, plan.limits.maxNodesPerChart)
      }

      const chartId = crypto.randomUUID()

      const [chart] = await db
        .insert(charts)
        .values({
          id: chartId,
          workspaceId: auth.workspaceId,
          name,
          status,
          version: 1,
          ownerId: auth.userId,
          creatorId: auth.userId,
        })
        .returning()

      // Seed from template — generate fresh IDs to avoid PK conflicts across charts.
      // Only allow-listed fields (validated above) are written.
      const deptIdMap = new Map<string, string>()
      const nodeIdMap = new Map<string, string>()

      if (templateDepts.length) {
        const newDepts = templateDepts.map((d) => {
          const newId = crypto.randomUUID()
          deptIdMap.set(d.id, newId)
          return {
            id: newId,
            chartId,
            name: d.name,
            colour: d.colour,
            workspaceDepartmentId: d.workspaceDepartmentId ?? null,
          }
        })
        await db.insert(departments).values(newDepts)
      }

      if (templateNodes.length) {
        // Pre-generate all node IDs so managerId refs can be remapped in one pass
        templateNodes.forEach((n) => nodeIdMap.set(n.id, crypto.randomUUID()))
        const newNodes = templateNodes.map((n) => ({
          ...n,
          id: nodeIdMap.get(n.id)!,
          chartId,
          departmentId: n.departmentId ? (deptIdMap.get(n.departmentId) ?? null) : null,
          managerId: n.managerId ? (nodeIdMap.get(n.managerId) ?? null) : null,
        }))
        for (const part of chunk(newNodes)) await db.insert(nodes).values(part)
      }

      // Edges may only connect nodes that were seeded into this chart.
      const newEdges = templateEdges
        .filter((e) => nodeIdMap.has(e.sourceId) && nodeIdMap.has(e.targetId))
        .map((e) => ({
          id: crypto.randomUUID(),
          chartId,
          sourceId: nodeIdMap.get(e.sourceId)!,
          targetId: nodeIdMap.get(e.targetId)!,
        }))
      for (const part of chunk(newEdges)) await db.insert(edges).values(part)

      // Funnel: the workspace's first chart (the plan's chart count was 0 before this one).
      if (chartCount === 0) {
        await track('first_chart_created', { userId: auth.userId, workspaceId: auth.workspaceId, consent: hasAnalyticsConsent(req), props: { plan: plan.tier } })
      }

      return res.status(201).json(chart)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
