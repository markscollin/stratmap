import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { requireRole, requireChartsEditable, getEffectivePlan, sendPlanLimit } from '../../_lib/access'
import { revisionStillCurrent, sentRevision, guardFailure, sendChartChanged, sendRevisionHeader } from '../../_lib/revision'
import { applySnapshot, saveSnapshot } from '../../_lib/snapshots'
import { logAudit } from '../../_lib/audit'
import { parseBody } from '../../_lib/validate'
import { ChartSync, MAX_SAMPLE_NODES } from '../../_lib/schemas'
import { db } from '../../_lib/db'
import { charts, nodes, departments, workspaceDepartments, type SnapshotData } from '../../../src/lib/db/schema'

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
    if (new Set(body.nodes.map(n => n.id)).size !== body.nodes.length) return res.status(400).json({ error: 'Duplicate role ids' })

    const [currentNodes, chartDepts, wsDepts] = await Promise.all([
      db.select().from(nodes).where(eq(nodes.chartId, chartId)),
      db.select().from(departments).where(eq(departments.chartId, chartId)),
      db.select({ id: workspaceDepartments.id }).from(workspaceDepartments).where(eq(workspaceDepartments.workspaceId, auth.workspaceId)),
    ])

    // Departments: every one the chart has, plus the new ones (a name the chart already has is reused, not doubled).
    const chartDeptByName = new Map(chartDepts.map(d => [d.name.toLowerCase(), d.id]))
    const deptAlias = new Map<string, string>()
    const added: SnapshotData['departments'] = []
    for (const d of body.departments) {
      const same = chartDeptByName.get(d.name.toLowerCase())
      if (same) { deptAlias.set(d.id, same); continue }
      if (chartDepts.some(c => c.id === d.id)) continue
      chartDeptByName.set(d.name.toLowerCase(), d.id)
      added.push({ id: d.id, name: d.name, colour: d.colour, workspaceDepartmentId: null })
    }
    const validDept = new Set([...chartDepts.map(d => d.id), ...added.map(d => d.id), ...wsDepts.map(d => d.id)])
    const deptOf = (id: string | null | undefined) => {
      const real = id ? (deptAlias.get(id) ?? id) : null
      return real && validDept.has(real) ? real : null
    }

    const before = new Map(currentNodes.map(n => [n.id, n]))
    const ids = new Set(body.nodes.map(n => n.id))
    const nextNodes: SnapshotData['nodes'] = body.nodes.map(n => {
      const fromFile = {
        name: n.name, title: n.title, departmentId: deptOf(n.departmentId), managerId: n.managerId && ids.has(n.managerId) ? n.managerId : null,
        status: n.status ?? 'active', employmentType: n.employmentType ?? 'full-time', roleType: n.roleType ?? null,
        location: n.location ?? null, startDate: n.startDate ?? null, externalId: n.externalId ?? null, email: n.email ?? null,
      }
      const old = before.get(n.id)
      if (old) {
        const { chartId: _c, ...row } = old
        return { ...row, ...fromFile }
      }
      return { id: n.id, ...fromFile, avatarUrl: null, x: n.x, y: n.y, isNew: false }
    })
    const seen = new Set<string>()
    const nextEdges: SnapshotData['edges'] = body.edges.filter(e => {
      const key = `${e.sourceId}>${e.targetId}`
      if (e.sourceId === e.targetId || !ids.has(e.sourceId) || !ids.has(e.targetId) || seen.has(key)) return false
      seen.add(key)
      return true
    })

    const plan = await getEffectivePlan(auth.workspaceId)
    if (!plan) return res.status(404).json({ error: 'Workspace not found' })
    const max = plan.limits.maxNodesPerChart
    const grows = nextNodes.length > currentNodes.length
    if (grows && max >= 0 && nextNodes.length > max) return sendPlanLimit(res, 'nodes', plan, max)
    if (grows && chart.isSample && nextNodes.length > MAX_SAMPLE_NODES) {
      return res.status(400).json({ error: 'sample-too-large', message: `A sample chart can have at most ${MAX_SAMPLE_NODES} roles.` })
    }

    if (!(await revisionStillCurrent(req, res, chartId))) return
    await saveSnapshot({ workspaceId: auth.workspaceId, chartId, name: 'Before update from file', kind: 'auto', userId: auth.userId })
    const data: SnapshotData = {
      nodes: nextNodes,
      edges: nextEdges,
      departments: [...chartDepts.map(({ chartId: _c, ...d }) => d), ...added],
    }
    try {
      await applySnapshot(chartId, auth.workspaceId, data, { claimRevision: { expected: sentRevision(req) }, deletedBy: auth.userId })
    } catch (err) {
      if (guardFailure(err) === 'chart-changed') { await sendChartChanged(res, chartId); return }
      throw err
    }
    await sendRevisionHeader(res, chartId)

    const addedRoles = nextNodes.filter(n => !before.has(n.id)).length
    const removedRoles = currentNodes.filter(n => !ids.has(n.id)).length
    const fields = ['name', 'title', 'departmentId', 'status', 'employmentType', 'roleType', 'location', 'startDate'] as const
    const changedRoles = nextNodes.filter(n => {
      const old = before.get(n.id)
      return old && fields.some(f => (old[f] ?? null) !== (n[f] ?? null))
    }).length
    await logAudit({
      workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'chart.updated_from_file', targetType: 'chart', targetId: chartId,
      details: { chartName: chart.name, added: addedRoles, removed: removedRoles, changed: changedRoles },
    })
    return res.json({ roles: nextNodes.length, added: addedRoles, removed: removedRoles, changed: changedRoles })
  } catch (err) {
    console.error('/api/charts/[id]/sync', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
