import type { VercelRequest, VercelResponse } from '@vercel/node'
import { desc, eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { requireRole } from '../_lib/access'
import { enforceRateLimit } from '../_lib/rateLimit'
import { logAudit } from '../_lib/audit'
import { db } from '../_lib/db'
import { nodeOrder, edgeOrder } from '../_lib/order'
import {
  auditLog, chartSnapshots, charts, departments, edges, headcountPlans, jobDescriptions, nodes, pendingInvites,
  roleComments, roleTemplates, workspaceDepartments, workspaceMembers, workspaces,
} from '../../src/lib/db/schema'
import { buildWorkspaceRolesCsv } from '../../src/lib/exportOrg'
import type { OrgNode } from '../../src/types'

// Workspace export (roadmap 4.2): everything the workspace holds, for its owner and admins. Free on every plan.
//   GET /api/workspace/export               -> one JSON file
//   GET /api/workspace/export?format=csv    -> every role of every chart, in the importer's column layout
// Includes salary bands (owner/admin only, like the job description screen). Never includes Stripe ids, invite
// tokens or share-link codes (a code is a password to a public chart).
//
// Size (R-58): a function's reply is capped (4.5 MB on Vercel unless it is streamed) and so is one Neon query's reply. So the
// JSON is written chart by chart (`res.write`), each chart's rows are read in their own queries, nothing is pretty-printed, and
// saved versions are listed WITHOUT their contents (each lists `dataUrl`, the existing per-version endpoint, any member may read
// it). Format `/2` = `/1` minus `chartVersions[].data`, plus `dataUrl`.

const AUDIT_ROWS = 10_000

const toNode = (r: typeof nodes.$inferSelect): OrgNode => ({
  id: r.id, name: r.name, title: r.title, departmentId: r.departmentId ?? '', managerId: r.managerId,
  status: r.status, employmentType: r.employmentType, roleType: r.roleType ?? undefined,
  location: r.location ?? undefined, startDate: r.startDate ?? undefined, x: r.x, y: r.y,
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await requireAuth(req, res)
  if (!auth) return

  try {
    if (!(await requireRole(auth, res, 'admin'))) return
    // Big queries: a few downloads an hour is plenty.
    if (!(await enforceRateLimit(res, `export:${auth.workspaceId}`, 10, 60 * 60))) return

    const wsId = auth.workspaceId
    const [[ws], members, invites, wsDepartments, chartRows, templates, plans] = await Promise.all([
      db.select().from(workspaces).where(eq(workspaces.id, wsId)).limit(1),
      db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, wsId)),
      db.select().from(pendingInvites).where(eq(pendingInvites.workspaceId, wsId)),
      db.select().from(workspaceDepartments).where(eq(workspaceDepartments.workspaceId, wsId)),
      db.select().from(charts).where(eq(charts.workspaceId, wsId)),
      db.select().from(roleTemplates).where(eq(roleTemplates.workspaceId, wsId)),
      db.select().from(headcountPlans).where(eq(headcountPlans.workspaceId, wsId)),
    ])
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })

    // One chart's rows at a time, so no single query (or the reply) has to hold the whole workspace.
    const chartRowsOf = async (chartId: string) => {
      const [n, e, d] = await Promise.all([
        db.select().from(nodes).where(eq(nodes.chartId, chartId)).orderBy(...nodeOrder),
        db.select().from(edges).where(eq(edges.chartId, chartId)).orderBy(...edgeOrder),
        db.select().from(departments).where(eq(departments.chartId, chartId)),
      ])
      return { nodeRows: n, edgeRows: e, deptRows: d }
    }

    await logAudit({
      workspaceId: wsId, actorUserId: auth.userId, action: 'workspace.exported', targetType: 'workspace', targetId: wsId,
      details: { format: req.query.format === 'csv' ? 'csv' : 'json' },
    })

    res.setHeader('Cache-Control', 'no-store')

    if (req.query.format === 'csv') {
      const perChart = []
      for (const c of chartRows) {
        const { nodeRows, edgeRows, deptRows } = await chartRowsOf(c.id)
        perChart.push({
          name: c.name,
          nodes: nodeRows.map(toNode),
          edges: edgeRows.map(e => ({ id: e.id, sourceId: e.sourceId, targetId: e.targetId })),
          departments: deptRows.map(d => ({ id: d.id, name: d.name, colour: d.colour })),
        })
      }
      const { csv } = buildWorkspaceRolesCsv(perChart)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="stratmap-roles.csv"')
      return res.status(200).end(csv)
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="stratmap-workspace.json"')
    res.status(200)
    const field = (key: string, value: unknown, first = false) => `${first ? '' : ','}${JSON.stringify(key)}:${JSON.stringify(value)}`

    res.write('{' + field('exportedAt', new Date().toISOString(), true)
      + field('format', 'stratmap-workspace-export/2')
      + field('workspace', { id: ws.id, name: ws.name, planTier: ws.planTier, createdAt: ws.createdAt })
      + field('members', members.map(({ workspaceId: _w, ...m }) => m))
      + field('invites', invites.map(({ workspaceId: _w, tokenHash: _t, ...i }) => i))
      + field('departments', wsDepartments.map(({ workspaceId: _w, ...d }) => d))
      + ',"charts":[')
    for (const [i, { workspaceId: _w, ...c }] of chartRows.entries()) {
      const [{ nodeRows, edgeRows, deptRows }, jdRows] = await Promise.all([
        chartRowsOf(c.id),
        db.select().from(jobDescriptions).where(eq(jobDescriptions.chartId, c.id)),
      ])
      res.write((i ? ',' : '') + JSON.stringify({
        ...c,
        departments: deptRows.map(({ chartId: _c, ...d }) => d),
        nodes: nodeRows.map(({ chartId: _c, ...n }) => n),
        edges: edgeRows.map(({ chartId: _c, ...e }) => e),
        jobDescriptions: jdRows.map(({ chartId: _c, ...j }) => j),
      }))
    }
    res.write(']' + field('roleTemplates', templates.map(({ workspaceId: _w, ...t }) => t))
      + field('headcountPlans', plans.map(({ workspaceId: _w, ...p }) => p))
      + ',"comments":[')
    let firstComment = true
    for (const c of chartRows) {
      const rows = await db.select().from(roleComments).where(eq(roleComments.chartId, c.id))
      for (const { workspaceId: _w, ...row } of rows) { res.write((firstComment ? '' : ',') + JSON.stringify(row)); firstComment = false }
    }
    res.write('],"chartVersions":[')
    let firstVersion = true
    for (const c of chartRows) {
      // Metadata only: a version's contents can be as big as the chart, times up to 84 versions a chart.
      const rows = await db.select({
        id: chartSnapshots.id, chartId: chartSnapshots.chartId, name: chartSnapshots.name, kind: chartSnapshots.kind,
        createdBy: chartSnapshots.createdBy, createdAt: chartSnapshots.createdAt, nodeCount: chartSnapshots.nodeCount, edgeCount: chartSnapshots.edgeCount,
      }).from(chartSnapshots).where(eq(chartSnapshots.chartId, c.id)).orderBy(desc(chartSnapshots.createdAt))
      for (const v of rows) {
        res.write((firstVersion ? '' : ',') + JSON.stringify({ ...v, dataUrl: `/api/charts/${v.chartId}/snapshots/${v.id}` }))
        firstVersion = false
      }
    }
    const events = await db.select().from(auditLog).where(eq(auditLog.workspaceId, wsId))
      .orderBy(desc(auditLog.createdAt)).limit(AUDIT_ROWS)
    res.write(']' + field('activityLog', events.map(({ workspaceId: _w, ...e }) => e)) + '}')
    return res.end()
  } catch (err) {
    console.error('/api/workspace/export', err)
    // Part of the file may already be on its way: end it (the download is then visibly broken JSON) rather than append an error.
    if (res.headersSent) return res.end()
    return res.status(500).json({ error: 'Internal server error' })
  }
}
