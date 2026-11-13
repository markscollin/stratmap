import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, count, eq, gt, inArray } from 'drizzle-orm'
import { requireAuth } from '../../../../_lib/auth'
import { requireRole, requireChartsEditable, getEffectivePlan, sendPlanLimit } from '../../../../_lib/access'
import { claimRevision } from '../../../../_lib/revision'
import { runAtomically } from '../../../../_lib/atomic'
import { trashCutoff } from '../../../../_lib/nodeTrash'
import { db } from '../../../../_lib/db'
import { charts, nodes, edges, roleComments, deletedNodes } from '../../../../../src/lib/db/schema'
import { fitsLimit } from '../../../../../src/lib/plans'

// POST /api/charts/:id/nodes/:nodeId/restore — Undo of a role delete (launch review R-02, owner decision D-1).
// Puts back the role, its comments and its reporting lines from the copy kept when it was deleted (a few days,
// see api/_lib/nodeTrash.ts). Editor and above, same plan checks as adding a role. All or nothing.
//   201 { id }                   restored
//   200 { id, alreadyThere }     the role is in the chart already (a retried request): nothing changes
//   404 { error: 'nothing-to-restore' }  no copy (never deleted, expired): the client creates the role afresh instead
const asDate = (v: unknown): Date | null => (v ? new Date(v as string) : null)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const chartId = req.query.id as string
    const nodeId = req.query.nodeId as string

    const [chart] = await db.select({ id: charts.id }).from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId))).limit(1)
    if (!chart) return res.status(404).json({ error: 'Chart not found' })
    if (!(await requireRole(auth, res, 'editor'))) return
    if (!(await requireChartsEditable(auth.workspaceId, res))) return

    const [present] = await db.select({ id: nodes.id }).from(nodes).where(and(eq(nodes.id, nodeId), eq(nodes.chartId, chartId))).limit(1)
    if (present) return res.status(200).json({ id: nodeId, alreadyThere: true })

    const [copy] = await db.select().from(deletedNodes)
      .where(and(eq(deletedNodes.chartId, chartId), eq(deletedNodes.nodeId, nodeId), gt(deletedNodes.deletedAt, trashCutoff()))).limit(1)
    if (!copy) return res.status(404).json({ error: 'nothing-to-restore' })

    const plan = await getEffectivePlan(auth.workspaceId)
    if (!plan) return res.status(404).json({ error: 'Workspace not found' })
    const [{ value: nodeCount }] = await db.select({ value: count() }).from(nodes).where(eq(nodes.chartId, chartId))
    if (!fitsLimit(plan.limits.maxNodesPerChart, nodeCount)) return sendPlanLimit(res, 'nodes', plan, plan.limits.maxNodesPerChart)

    // A line comes back only if the role at its other end is still in the chart (it may have been deleted since).
    const { node, comments, edges: lines } = copy.data
    const others = [...new Set(lines.map(l => (l.sourceId === nodeId ? l.targetId : l.sourceId)))]
    const stillThere = new Set(others.length
      ? (await db.select({ id: nodes.id }).from(nodes).where(and(eq(nodes.chartId, chartId), inArray(nodes.id, others)))).map(n => n.id)
      : [])
    const linesBack = lines.filter(l => stillThere.has(l.sourceId === nodeId ? l.targetId : l.sourceId))
    // Parents before their replies (a reply points at its parent).
    const commentsBack = [...comments].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId))

    if ((await claimRevision(req, res, chartId)) === null) return
    await runAtomically(d => [
      d.insert(nodes).values(node),
      ...(commentsBack.length ? [d.insert(roleComments).values(commentsBack.map(c => ({
        ...c, createdAt: new Date(c.createdAt), editedAt: asDate(c.editedAt), deletedAt: asDate(c.deletedAt), resolvedAt: asDate(c.resolvedAt),
      }))).onConflictDoNothing()] : []),
      ...(linesBack.length ? [d.insert(edges).values(linesBack).onConflictDoNothing()] : []),
      d.delete(deletedNodes).where(eq(deletedNodes.id, copy.id)),
    ])
    return res.status(201).json({ id: nodeId })
  } catch (err) {
    console.error('/api/charts/[id]/nodes/[nodeId]/restore', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
