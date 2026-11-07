import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { requireRole } from '../../_lib/access'
import { parseBody } from '../../_lib/validate'
import { CommentCreate } from '../../_lib/schemas'
import { enforceRateLimit } from '../../_lib/rateLimit'
import { notifyAboutComment, toCommentView } from '../../_lib/comments'
import { db } from '../../_lib/db'
import { charts, nodes, roleComments, workspaceMembers } from '../../../src/lib/db/schema'

// Role comments (roadmap 5).
//   GET  /api/charts/:id/comments?nodeId=…   every comment on one role, oldest first (any member can read)
//   GET  /api/charts/:id/comments?counts=1   { counts: { [nodeId]: open threads } } for the badges on the canvas
//   POST /api/charts/:id/comments            { nodeId, body, parentId?, mentions? } (commenter and above)
// Comments are discussion, not chart content: they never bump the chart revision and still work on a chart that is
// view-only because the workspace is over its plan.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const chartId = req.query.id as string

    const [chart] = await db.select({ id: charts.id, name: charts.name }).from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId))).limit(1)
    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    if (req.method === 'GET') {
      if (req.query.counts) {
        // Open threads per role: top-level and not resolved (a deleted shell only exists while it still has replies).
        const rows = await db.select({ nodeId: roleComments.nodeId, n: sql<number>`count(*)::int` }).from(roleComments)
          .where(and(eq(roleComments.chartId, chartId), isNull(roleComments.parentId), isNull(roleComments.resolvedAt)))
          .groupBy(roleComments.nodeId)
        return res.json({ counts: Object.fromEntries(rows.map(r => [r.nodeId, r.n])) })
      }
      const nodeId = typeof req.query.nodeId === 'string' ? req.query.nodeId : ''
      if (!nodeId) return res.status(400).json({ error: 'nodeId-required' })
      const rows = await db.select().from(roleComments)
        .where(and(eq(roleComments.chartId, chartId), eq(roleComments.nodeId, nodeId)))
        .orderBy(asc(roleComments.createdAt), asc(roleComments.id))
      const members = await db.select({ userId: workspaceMembers.userId, name: workspaceMembers.name, email: workspaceMembers.email })
        .from(workspaceMembers).where(eq(workspaceMembers.workspaceId, auth.workspaceId))
      const names = new Map(members.map(m => [m.userId, m.name || m.email || null]))
      return res.json({ comments: rows.map(r => toCommentView(r, names)) })
    }

    if (req.method === 'POST') {
      if (!(await requireRole(auth, res, 'commenter'))) return
      if (!(await enforceRateLimit(res, `comment:${auth.userId}`, 30, 60))) return
      const body = parseBody(CommentCreate, req, res)
      if (!body) return

      const [node] = await db.select({ id: nodes.id, title: nodes.title }).from(nodes)
        .where(and(eq(nodes.id, body.nodeId), eq(nodes.chartId, chartId))).limit(1)
      if (!node) return res.status(404).json({ error: 'Role not found' })

      let parent: typeof roleComments.$inferSelect | undefined
      if (body.parentId) {
        ;[parent] = await db.select().from(roleComments)
          .where(and(eq(roleComments.id, body.parentId), eq(roleComments.chartId, chartId), eq(roleComments.nodeId, body.nodeId))).limit(1)
        if (!parent) return res.status(404).json({ error: 'Comment not found' })
        if (parent.parentId) return res.status(400).json({ error: 'replies-are-one-level', message: 'Reply to the first comment of the thread.' })
      }

      const members = await db.select({ userId: workspaceMembers.userId, name: workspaceMembers.name, email: workspaceMembers.email })
        .from(workspaceMembers).where(eq(workspaceMembers.workspaceId, auth.workspaceId))
      // Only real members of this workspace can be mentioned, and never yourself.
      const memberIds = new Set(members.map(m => m.userId))
      const mentions = [...new Set(body.mentions ?? [])].filter(id => memberIds.has(id) && id !== auth.userId)

      const [created] = await db.insert(roleComments).values({
        id: crypto.randomUUID(), workspaceId: auth.workspaceId, chartId, nodeId: body.nodeId,
        parentId: parent?.id ?? null, authorId: auth.userId, body: body.body, mentions,
      }).returning()
      // A reply to a resolved thread reopens it.
      if (parent?.resolvedAt) {
        await db.update(roleComments).set({ resolvedAt: null, resolvedBy: null }).where(eq(roleComments.id, parent.id))
      }

      await notifyAboutComment({
        workspaceId: auth.workspaceId, chartId, chartName: chart.name, nodeId: node.id, roleTitle: node.title,
        authorId: auth.userId, members, body: created.body, mentioned: mentions, replyTo: parent?.authorId ?? null,
      })

      const names = new Map(members.map(m => [m.userId, m.name || m.email || null]))
      return res.status(201).json(toCommentView(created, names))
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/comments', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
