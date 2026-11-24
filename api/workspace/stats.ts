import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, inArray, and, ne } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { db } from '../_lib/db'
import { charts, nodes, departments, workspaceDepartments } from '../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const wsId = auth.workspaceId

    // Which charts the figures are about (R-57). The live charts when the workspace has any (the published picture of the org);
    // otherwise every chart that is not archived and not the sample. Before this, only live charts counted, and going live needs
    // the approval workflow (Starter and up) and an admin, so most workspaces saw 0 right after building a chart.
    const chartRows = await db
      .select({ id: charts.id, status: charts.status })
      .from(charts)
      .where(and(eq(charts.workspaceId, wsId), eq(charts.isSample, false), ne(charts.status, 'archived')))
    const live = chartRows.filter(c => c.status === 'live')
    const scope: 'live' | 'all' = live.length > 0 ? 'live' : 'all'
    const liveChartIds = (scope === 'live' ? live : chartRows).map(c => c.id)

    let totalHeadcount = 0
    let totalOpen = 0
    let nodeList: { status: string; departmentId: string | null; roleType: string | null }[] = []
    let chartDeptList: { id: string; workspaceDepartmentId: string | null }[] = []

    if (liveChartIds.length > 0) {
      const [ns, ds] = await Promise.all([
        db
          .select({ status: nodes.status, departmentId: nodes.departmentId, roleType: nodes.roleType })
          .from(nodes)
          .where(inArray(nodes.chartId, liveChartIds)),
        db
          .select({ id: departments.id, workspaceDepartmentId: departments.workspaceDepartmentId })
          .from(departments)
          .where(inArray(departments.chartId, liveChartIds)),
      ])
      nodeList = ns
      chartDeptList = ds
      totalHeadcount = ns.filter(n => n.status === 'active').length
      totalOpen = ns.filter(n => n.status === 'open').length
    }

    const wsDepts = await db
      .select()
      .from(workspaceDepartments)
      .where(eq(workspaceDepartments.workspaceId, wsId))

    const wsDeptIds = new Set(wsDepts.map(d => d.id))
    // chartDeptId → workspaceDeptId lookup
    const chartDeptToWsDept: Record<string, string> = {}
    for (const d of chartDeptList) {
      if (d.workspaceDepartmentId) chartDeptToWsDept[d.id] = d.workspaceDepartmentId
    }

    // Aggregate per workspace department
    const deptCounts: Record<string, { headcount: number; open: number }> = {}
    for (const n of nodeList) {
      if (!n.departmentId) continue
      // A role's department is a chart department (linked to a workspace one) or, on a blank chart, the workspace department itself (R-47).
      const wsDeptId = chartDeptToWsDept[n.departmentId] ?? (wsDeptIds.has(n.departmentId) ? n.departmentId : undefined)
      if (!wsDeptId) continue
      if (!deptCounts[wsDeptId]) deptCounts[wsDeptId] = { headcount: 0, open: 0 }
      if (n.status === 'active') deptCounts[wsDeptId].headcount++
      if (n.status === 'open') deptCounts[wsDeptId].open++
    }

    const deptBreakdown = wsDepts.map(d => ({
      id: d.id,
      name: d.name,
      colour: d.colour,
      headcount: deptCounts[d.id]?.headcount ?? 0,
      open: deptCounts[d.id]?.open ?? 0,
    }))

    const roleTypeBreakdown = {
      'new-headcount': nodeList.filter(n => n.roleType === 'new-headcount').length,
      backfill:        nodeList.filter(n => n.roleType === 'backfill').length,
      contractor:      nodeList.filter(n => n.roleType === 'contractor').length,
      tbd:             nodeList.filter(n => n.roleType === 'tbd').length,
    }

    return res.json({ totalHeadcount, totalOpen, deptBreakdown, roleTypeBreakdown, scope, chartCount: liveChartIds.length })
  } catch (err) {
    console.error('/api/workspace/stats', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
