import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and, or } from 'drizzle-orm'
import { requireAuth } from '../../../_lib/auth'
import { requireRole, requireChartsEditable } from '../../../_lib/access'
import { writeWithRevision } from '../../../_lib/revision'
import { parseBody } from '../../../_lib/validate'
import { NodeUpdate } from '../../../_lib/schemas'
import { db } from '../../../_lib/db'
import { purgeExpiredTrash } from '../../../_lib/nodeTrash'
import { checkRoleReferences } from '../../../_lib/references'
import { charts, nodes, edges, roleComments, deletedNodes, jobDescriptions } from '../../../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const chartId = req.query.id as string
    const nodeId = req.query.nodeId as string

    const [chart] = await db
      .select({ id: charts.id })
      .from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId)))
      .limit(1)

    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    if ((req.method === 'PUT' || req.method === 'DELETE') && !(await requireRole(auth, res, 'editor'))) return
    if ((req.method === 'PUT' || req.method === 'DELETE') && !(await requireChartsEditable(auth.workspaceId, res))) return

    if (req.method === 'PUT') {
      const updates = parseBody(NodeUpdate, req, res)
      if (!updates) return
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updatable fields' })
      const [current] = await db.select().from(nodes).where(and(eq(nodes.id, nodeId), eq(nodes.chartId, chartId))).limit(1)
      // Checked before the revision is claimed (R-70): a missing role bumps nothing, and the same change sent again (its first
      // reply was lost) is answered as done instead of with a false "chart changed".
      if (!current) return res.status(404).json({ error: 'Node not found' })
      const changed = (Object.keys(updates) as (keyof typeof updates)[]).some(k => (updates[k] ?? null) !== ((current as Record<string, unknown>)[k] ?? null))
      if (!changed) return res.json(current)
      if (updates.departmentId !== undefined || updates.managerId !== undefined) {
        if (!(await checkRoleReferences(res, { workspaceId: auth.workspaceId, chartId }, updates, current))) return
      }
      // The claim and the change in one transaction (R-70).
      const refused = await writeWithRevision(req, res, chartId, d => [
        d.update(nodes).set(updates).where(and(eq(nodes.id, nodeId), eq(nodes.chartId, chartId))),
      ])
      if (refused) return
      const [updated] = await db.select().from(nodes).where(and(eq(nodes.id, nodeId), eq(nodes.chartId, chartId))).limit(1)
      return res.json(updated)
    }

    if (req.method === 'DELETE') {
      // Already gone (a retried delete whose reply was lost): done, without claiming a revision (R-70).
      const [node] = await db.select().from(nodes).where(and(eq(nodes.id, nodeId), eq(nodes.chartId, chartId))).limit(1)
      if (!node) return res.status(204).end()

      // Keep a copy for a few days so Undo can bring back the role with its comments and lines (D-1, R-02).
      // The reporting lines go with the role: they have no foreign key, so without this they were left dangling.
      const touching = or(eq(edges.sourceId, nodeId), eq(edges.targetId, nodeId))
      const jdMatch = and(eq(jobDescriptions.chartId, chartId), eq(jobDescriptions.nodeId, nodeId))
      const [comments, lines, jds] = await Promise.all([
        db.select().from(roleComments).where(and(eq(roleComments.chartId, chartId), eq(roleComments.nodeId, nodeId))),
        db.select().from(edges).where(and(eq(edges.chartId, chartId), touching)),
        db.select().from(jobDescriptions).where(jdMatch),
      ])
      const copy = { id: crypto.randomUUID(), chartId, nodeId, deletedBy: auth.userId, deletedAt: new Date(), data: { node, comments, edges: lines, jobDescriptions: jds } }
      // The claim, the copy and the deletes in one transaction (R-70).
      const refused = await writeWithRevision(req, res, chartId, d => [
        d.insert(deletedNodes).values(copy).onConflictDoUpdate({
          target: [deletedNodes.chartId, deletedNodes.nodeId],
          set: { deletedBy: copy.deletedBy, deletedAt: copy.deletedAt, data: copy.data },
        }),
        d.delete(edges).where(and(eq(edges.chartId, chartId), touching)),
        d.delete(jobDescriptions).where(jdMatch), // R-38: the job description (and salary band) goes with the role; the copy above keeps it for Undo
        d.delete(nodes).where(and(eq(nodes.id, nodeId), eq(nodes.chartId, chartId))), // comments cascade
      ])
      if (refused) return
      // Tidy-up of this chart's expired copies; the daily job covers the rest. Never fails the delete.
      await purgeExpiredTrash(chartId).catch(err => console.error('[nodeTrash] purge failed', err))
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/nodes/[nodeId]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
