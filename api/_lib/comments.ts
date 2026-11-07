import { eq, inArray } from 'drizzle-orm'
import { db } from './db'
import { getAppUrl } from './url'
import { sendCommentNotification } from './email'
import { roleComments, userNotificationPrefs, workspaces } from '../../src/lib/db/schema'

// Role comments (roadmap 5): the shape the API returns, and who gets an email.

export interface CommentView {
  id: string
  nodeId: string
  parentId: string | null
  authorId: string
  /** The author's name, or null once they have left the workspace ("A former member" in the UI). */
  authorName: string | null
  /** Empty for a deleted comment (a shell kept so its replies still make sense). */
  body: string
  mentions: string[]
  createdAt: string
  editedAt: string | null
  deleted: boolean
  /** Top-level comments only. */
  resolved: boolean
  resolvedBy: string | null
}

export function toCommentView(r: typeof roleComments.$inferSelect, names: Map<string, string | null>): CommentView {
  const deleted = r.deletedAt !== null
  return {
    id: r.id, nodeId: r.nodeId, parentId: r.parentId, authorId: r.authorId,
    authorName: names.get(r.authorId) ?? null,
    body: deleted ? '' : r.body,
    mentions: deleted ? [] : r.mentions,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt ? r.editedAt.toISOString() : null,
    deleted,
    resolved: r.resolvedAt !== null,
    resolvedBy: r.resolvedBy,
  }
}

export interface NotifyInput {
  workspaceId: string
  chartId: string
  chartName: string
  nodeId: string
  roleTitle: string
  authorId: string
  members: { userId: string; name: string | null; email: string }[]
  body: string
  /** Members @mentioned in this comment (already checked and without the author). */
  mentioned: string[]
  /** Author of the comment being replied to, if this is a reply. */
  replyTo: string | null
}

/**
 * Emails people about a comment (owner-decided): whoever is @mentioned, and the author of the comment being replied to.
 * Never the author themselves, never someone who is not a member, never someone who switched comment emails off, and
 * nobody twice (a mention wins over a reply). Best-effort: a failed email never fails the comment.
 */
export async function notifyAboutComment(input: NotifyInput): Promise<void> {
  try {
    const reasons = new Map<string, 'mention' | 'reply'>()
    if (input.replyTo && input.replyTo !== input.authorId) reasons.set(input.replyTo, 'reply')
    for (const id of input.mentioned) if (id !== input.authorId) reasons.set(id, 'mention')

    const byId = new Map(input.members.map(m => [m.userId, m]))
    const recipients = [...reasons.keys()].filter(id => byId.get(id)?.email)
    if (recipients.length === 0) return

    const off = await db.select({ userId: userNotificationPrefs.userId, on: userNotificationPrefs.commentEmails })
      .from(userNotificationPrefs).where(inArray(userNotificationPrefs.userId, recipients))
    const muted = new Set(off.filter(p => !p.on).map(p => p.userId))

    const author = byId.get(input.authorId)
    const authorName = author?.name || author?.email || 'Someone'
    const url = `${getAppUrl()}/charts/${encodeURIComponent(input.chartId)}?role=${encodeURIComponent(input.nodeId)}&tab=comments`
    const workspaceName = await workspaceNameOf(input.workspaceId)

    await Promise.allSettled(recipients.filter(id => !muted.has(id)).map(id =>
      sendCommentNotification({
        to: byId.get(id)!.email, reason: reasons.get(id)!, authorName, workspaceName,
        chartName: input.chartName, roleTitle: input.roleTitle, body: input.body, url,
      })))
  } catch (err) {
    console.error('[comments] could not send notifications', err)
  }
}

async function workspaceNameOf(workspaceId: string): Promise<string> {
  const [ws] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
  return ws?.name ?? 'your workspace'
}
