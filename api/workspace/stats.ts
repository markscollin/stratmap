import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, inArray, and } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { db } from '../_lib/db'
import { charts, nodes, departments, workspaceDepartments } from '../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const wsId = auth.workspaceId

    const liveChartRows = await db
      .select({ id: charts.id })
      .from(charts)
      .where(and(eq(charts.workspaceId, wsId), eq(charts.status, 'live')))

    const liveChartIds = liveChartRows.map(c => c.id)

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

    // chartDeptId → workspaceDeptId lookup
    const chartDeptToWsDept: Record<string, string> = {}
    for (const d of chartDeptList) {
      if (d.workspaceDepartmentId) chartDeptToWsDept[d.id] = d.workspaceDepartmentId
    }

    // Aggregate per workspace department
    const deptCounts: Record<string, { headcount: number; open: number }> = {}
    for (const n of nodeList) {
      if (!n.departmentId) continue
      const wsDeptId = chartDeptToWsDept[n.departmentId]
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

    return res.json({ totalHeadcount, totalOpen, deptBreakdown, roleTypeBreakdown })
  } catch (err) {
    console.error('/api/workspace/stats', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
