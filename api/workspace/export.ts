import type { VercelRequest, VercelResponse } from '@vercel/node'
import { desc, eq, inArray } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { requireRole } from '../_lib/access'
import { enforceRateLimit } from '../_lib/rateLimit'
import { logAudit } from '../_lib/audit'
import { db } from '../_lib/db'
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

    const chartIds = chartRows.map(c => c.id)
    const [nodeRows, edgeRows, deptRows, jdRows] = chartIds.length === 0 ? [[], [], [], []] : await Promise.all([
      db.select().from(nodes).where(inArray(nodes.chartId, chartIds)),
      db.select().from(edges).where(inArray(edges.chartId, chartIds)),
      db.select().from(departments).where(inArray(departments.chartId, chartIds)),
      db.select().from(jobDescriptions).where(inArray(jobDescriptions.chartId, chartIds)),
    ])

    await logAudit({
      workspaceId: wsId, actorUserId: auth.userId, action: 'workspace.exported', targetType: 'workspace', targetId: wsId,
      details: { format: req.query.format === 'csv' ? 'csv' : 'json' },
    })

    res.setHeader('Cache-Control', 'no-store')

    if (req.query.format === 'csv') {
      const { csv } = buildWorkspaceRolesCsv(chartRows.map(c => ({
        name: c.name,
        nodes: nodeRows.filter(n => n.chartId === c.id).map(toNode),
        edges: edgeRows.filter(e => e.chartId === c.id).map(e => ({ id: e.id, sourceId: e.sourceId, targetId: e.targetId })),
        departments: deptRows.filter(d => d.chartId === c.id).map(d => ({ id: d.id, name: d.name, colour: d.colour })),
      })))
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="stratmap-roles.csv"')
      return res.status(200).end(csv)
    }

    const comments = await db.select().from(roleComments).where(eq(roleComments.workspaceId, wsId))
    const snapshots = await db.select().from(chartSnapshots).where(eq(chartSnapshots.workspaceId, wsId))
    const events = await db.select().from(auditLog).where(eq(auditLog.workspaceId, wsId))
      .orderBy(desc(auditLog.createdAt)).limit(AUDIT_ROWS)

    const body = {
      exportedAt: new Date().toISOString(),
      format: 'stratmap-workspace-export/1',
      workspace: { id: ws.id, name: ws.name, planTier: ws.planTier, createdAt: ws.createdAt },
      members: members.map(({ workspaceId: _w, ...m }) => m),
      invites: invites.map(({ workspaceId: _w, tokenHash: _t, ...i }) => i),
      departments: wsDepartments.map(({ workspaceId: _w, ...d }) => d),
      charts: chartRows.map(({ workspaceId: _w, ...c }) => ({
        ...c,
        departments: deptRows.filter(d => d.chartId === c.id).map(({ chartId: _c, ...d }) => d),
        nodes: nodeRows.filter(n => n.chartId === c.id).map(({ chartId: _c, ...n }) => n),
        edges: edgeRows.filter(e => e.chartId === c.id).map(({ chartId: _c, ...e }) => e),
        jobDescriptions: jdRows.filter(j => j.chartId === c.id).map(({ chartId: _c, ...j }) => j),
      })),
      roleTemplates: templates.map(({ workspaceId: _w, ...t }) => t),
      headcountPlans: plans.map(({ workspaceId: _w, ...p }) => p),
      comments: comments.map(({ workspaceId: _w, ...c }) => c),
      chartVersions: snapshots.map(({ workspaceId: _w, ...v }) => v),
      activityLog: events.map(({ workspaceId: _w, ...e }) => e),
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="stratmap-workspace.json"')
    return res.status(200).end(JSON.stringify(body, null, 2))
  } catch (err) {
    console.error('/api/workspace/export', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
