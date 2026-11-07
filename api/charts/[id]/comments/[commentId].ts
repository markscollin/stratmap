import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, count, eq } from 'drizzle-orm'
import { requireAuth } from '../../../_lib/auth'
import { requireRole, atLeast, getPermission } from '../../../_lib/access'
import { parseBody } from '../../../_lib/validate'
import { CommentUpdate } from '../../../_lib/schemas'
import { notifyAboutComment, toCommentView } from '../../../_lib/comments'
import { db } from '../../../_lib/db'
import { charts, nodes, roleComments, workspaceMembers } from '../../../../src/lib/db/schema'

// PUT    /api/charts/:id/comments/:commentId  { body } edit your own comment, or { resolved } resolve / reopen a thread
// DELETE /api/charts/:id/comments/:commentId  delete your own comment; owners and admins can delete anyone's
// (Owner-decided.) Deleting a comment that still has replies keeps a "deleted" shell so the thread survives.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (req.method !== 'PUT' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

    const chartId = req.query.id as string
    const commentId = req.query.commentId as string

    const [chart] = await db.select({ id: charts.id, name: charts.name }).from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId))).limit(1)
    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    const [comment] = await db.select().from(roleComments)
      .where(and(eq(roleComments.id, commentId), eq(roleComments.chartId, chartId))).limit(1)
    if (!comment) return res.status(404).json({ error: 'Comment not found' })
    const isAuthor = comment.authorId === auth.userId

    const members = await db.select({ userId: workspaceMembers.userId, name: workspaceMembers.name, email: workspaceMembers.email })
      .from(workspaceMembers).where(eq(workspaceMembers.workspaceId, auth.workspaceId))
    const names = new Map(members.map(m => [m.userId, m.name || m.email || null]))

    if (req.method === 'DELETE') {
      // The author can always remove their own comment (even after being moved to a read-only role); admins can remove any.
      if (!isAuthor && !atLeast((await getPermission(auth)) ?? 'viewer', 'admin')) {
        return res.status(403).json({ error: 'forbidden', required: 'admin', message: 'You can only delete your own comments.' })
      }
      const [{ replies }] = await db.select({ replies: count() }).from(roleComments).where(eq(roleComments.parentId, comment.id))
      if (replies > 0) {
        await db.update(roleComments).set({ deletedAt: new Date(), body: '', mentions: [], resolvedAt: null, resolvedBy: null })
          .where(eq(roleComments.id, comment.id))
      } else {
        await db.delete(roleComments).where(eq(roleComments.id, comment.id))
        // A deleted shell with no replies left has nothing to hold together any more.
        if (comment.parentId) {
          const [parent] = await db.select().from(roleComments).where(eq(roleComments.id, comment.parentId)).limit(1)
          if (parent?.deletedAt) {
            const [{ left }] = await db.select({ left: count() }).from(roleComments).where(eq(roleComments.parentId, parent.id))
            if (left === 0) await db.delete(roleComments).where(eq(roleComments.id, parent.id))
          }
        }
      }
      return res.status(204).end()
    }

    // PUT: writing needs commenter or above
    if (!(await requireRole(auth, res, 'commenter'))) return
    const body = parseBody(CommentUpdate, req, res)
    if (!body) return

    if (body.resolved !== undefined) {
      if (comment.parentId) return res.status(400).json({ error: 'resolve-the-thread', message: 'Resolve the first comment of the thread.' })
      const [updated] = await db.update(roleComments)
        .set(body.resolved ? { resolvedAt: new Date(), resolvedBy: auth.userId } : { resolvedAt: null, resolvedBy: null })
        .where(eq(roleComments.id, comment.id)).returning()
      return res.json(toCommentView(updated, names))
    }

    // Edit the text: only the author, and not a deleted comment.
    if (!isAuthor) return res.status(403).json({ error: 'forbidden', message: 'You can only edit your own comments.' })
    if (comment.deletedAt) return res.status(404).json({ error: 'Comment not found' })
    const memberIds = new Set(members.map(m => m.userId))
    const mentions = [...new Set(body.mentions ?? [])].filter(id => memberIds.has(id) && id !== auth.userId)
    const [updated] = await db.update(roleComments)
      .set({ body: body.body!, mentions, editedAt: new Date() })
      .where(eq(roleComments.id, comment.id)).returning()

    // Only people newly mentioned by the edit are emailed.
    const [node] = await db.select({ title: nodes.title }).from(nodes).where(eq(nodes.id, comment.nodeId)).limit(1)
    const newlyMentioned = mentions.filter(id => !comment.mentions.includes(id))
    if (newlyMentioned.length > 0) {
      await notifyAboutComment({
        workspaceId: auth.workspaceId, chartId, chartName: chart.name, nodeId: comment.nodeId, roleTitle: node?.title ?? 'a role',
        authorId: auth.userId, members, body: updated.body, mentioned: newlyMentioned, replyTo: null,
      })
    }
    return res.json(toCommentView(updated, names))
  } catch (err) {
    console.error('/api/charts/[id]/comments/[commentId]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
