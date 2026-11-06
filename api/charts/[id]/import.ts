import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and, count } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { track, hasAnalyticsConsent } from '../../_lib/analytics'
import { requireRole, getEffectivePlan, sendPlanLimit, requireChartsEditable } from '../../_lib/access'
import { claimRevision } from '../../_lib/revision'
import { parseBody } from '../../_lib/validate'
import { ChartImport } from '../../_lib/schemas'
import { chunk } from '../../_lib/chunk'
import { db } from '../../_lib/db'
import { charts, nodes, edges, departments } from '../../../src/lib/db/schema'
import { fitsLimit } from '../../../src/lib/plans'

// POST /api/charts/:id/import  { nodes, edges, departments }
//
// Adds people from a spreadsheet import to an existing chart (roadmap 2.1). The
// client has already shown the user a dry run; this re-checks everything that
// matters on the server: role, frozen charts, and the plan's per-chart role limit
// (all or nothing, so a chart is never half imported because of the limit).
//
// Importing into a NEW chart goes through POST /api/charts, which takes the same
// shape as a template.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

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

    if (!(await requireRole(auth, res, 'editor'))) return
    if (!(await requireChartsEditable(auth.workspaceId, res))) return

    const body = parseBody(ChartImport, req, res)
    if (!body) return

    if (new Set(body.nodes.map(n => n.id)).size !== body.nodes.length) {
      return res.status(400).json({ error: 'Duplicate node ids in import' })
    }

    const plan = await getEffectivePlan(auth.workspaceId)
    if (!plan) return res.status(404).json({ error: 'Workspace not found' })
    const [{ value: nodeCount }] = await db.select({ value: count() }).from(nodes).where(eq(nodes.chartId, chartId))
    if (!fitsLimit(plan.limits.maxNodesPerChart, nodeCount, body.nodes.length)) {
      return sendPlanLimit(res, 'nodes', plan, plan.limits.maxNodesPerChart)
    }

    if ((await claimRevision(req, res, chartId)) === null) return

    // Departments: reuse the chart's own by name (case-insensitive), create the rest.
    const existing = await db.select().from(departments).where(eq(departments.chartId, chartId))
    const byName = new Map(existing.map(d => [d.name.toLowerCase(), d.id]))
    const deptIdMap = new Map<string, string>()
    const newDepts: (typeof departments.$inferInsert)[] = []
    for (const d of body.departments) {
      let id = byName.get(d.name.toLowerCase())
      if (!id) {
        id = crypto.randomUUID()
        byName.set(d.name.toLowerCase(), id)
        newDepts.push({ id, chartId, name: d.name, colour: d.colour })
      }
      deptIdMap.set(d.id, id)
    }
    if (newDepts.length) await db.insert(departments).values(newDepts)

    // Fresh ids for everything; references outside the payload are dropped.
    const nodeIdMap = new Map(body.nodes.map(n => [n.id, crypto.randomUUID()]))
    const newNodes = body.nodes.map(n => ({
      ...n,
      id: nodeIdMap.get(n.id)!,
      chartId,
      departmentId: n.departmentId ? (deptIdMap.get(n.departmentId) ?? null) : null,
      managerId: n.managerId ? (nodeIdMap.get(n.managerId) ?? null) : null,
    }))
    const seen = new Set<string>()
    const newEdges = body.edges
      .filter(e => nodeIdMap.has(e.sourceId) && nodeIdMap.has(e.targetId) && e.sourceId !== e.targetId)
      .filter(e => { const k = `${e.sourceId}>${e.targetId}`; if (seen.has(k)) return false; seen.add(k); return true })
      .map(e => ({
        id: crypto.randomUUID(),
        chartId,
        sourceId: nodeIdMap.get(e.sourceId)!,
        targetId: nodeIdMap.get(e.targetId)!,
      }))

    for (const part of chunk(newNodes)) await db.insert(nodes).values(part)
    for (const part of chunk(newEdges)) await db.insert(edges).values(part)

    if (!chart.isSample && nodeCount < 10 && nodeCount + newNodes.length >= 10) {
      await track('ten_roles_reached', { userId: auth.userId, workspaceId: auth.workspaceId, consent: hasAnalyticsConsent(req), props: { plan: plan.tier, via: 'import' } })
    }

    return res.status(201).json({
      imported: newNodes.length,
      edges: newEdges.length,
      newDepartments: newDepts.length,
    })
  } catch (err) {
    console.error('/api/charts/[id]/import', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
