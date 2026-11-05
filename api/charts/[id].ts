import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { requireRole, requireFeature, requireChartsEditable } from '../_lib/access'
import { parseBody } from '../_lib/validate'
import { ChartUpdate } from '../_lib/schemas'
import { db } from '../_lib/db'
import { APPROVAL_CHART_STATUSES } from '../../src/lib/plans'
import { charts, nodes, edges, departments } from '../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const chartId = req.query.id as string

    // Verify chart belongs to this workspace
    const [chart] = await db
      .select()
      .from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId)))
      .limit(1)

    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    if (req.method === 'GET') {
      const [nodeList, edgeList, deptList] = await Promise.all([
        db.select().from(nodes).where(eq(nodes.chartId, chartId)),
        db.select().from(edges).where(eq(edges.chartId, chartId)),
        db.select().from(departments).where(eq(departments.chartId, chartId)),
      ])

      return res.json({
        ...chart,
        nodes: nodeList,
        edges: edgeList,
        departments: deptList,
      })
    }

    if (req.method === 'PUT') {
      // Editors may rename, change status and toggle public sharing.
      if (!(await requireRole(auth, res, 'editor'))) return
      const body = parseBody(ChartUpdate, req, res)
      if (!body) return
      const { name, status, isPublic } = body
      // Over the chart limit (1.6) charts are view-only, but you can still make one private.
      const onlyUnsharing = isPublic === false && name === undefined && status === undefined
      if (!onlyUnsharing && !(await requireChartsEditable(auth.workspaceId, res))) return
      // Free plans can draft, edit and archive charts; review/approve/publish is the paid approval workflow.
      if (status && status !== chart.status && (APPROVAL_CHART_STATUSES as readonly string[]).includes(status)
        && !(await requireFeature(auth.workspaceId, res, 'approval-workflow'))) return

      const [updated] = await db
        .update(charts)
        .set({
          ...(name !== undefined && { name }),
          ...(status !== undefined && { status }),
          ...(isPublic !== undefined && { isPublic }),
          updatedAt: new Date(),
        })
        .where(eq(charts.id, chartId))
        .returning()

      return res.json(updated)
    }

    if (req.method === 'DELETE') {
      if (!(await requireRole(auth, res, 'admin'))) return
      // Cascade deletes nodes/edges/departments via FK
      await db.delete(charts).where(eq(charts.id, chartId))
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
