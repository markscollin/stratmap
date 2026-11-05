import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { reportError } from './sentry'
import { sendWorkspaceInvite } from './email'
import { inviteUrl, isExpired } from './inviteTokens'
import { workspaces, workspaceMembers, pendingInvites } from '../../src/lib/db/schema'

type InviteRow = typeof pendingInvites.$inferSelect

/** What clients may see of an invite: never the token hash. */
export function toInviteView(row: InviteRow, now = new Date()) {
  return {
    id: row.id,
    email: row.email,
    permission: row.permission,
    sentAt: row.sentAt,
    expiresAt: row.expiresAt,
    expired: isExpired(row.expiresAt, now),
  }
}

/** Emails an invite link. Failures are logged, never thrown: the invite is already saved. */
export async function sendInviteEmail(opts: {
  workspaceId: string
  inviterUserId: string
  email: string
  token: string
}): Promise<void> {
  try {
    const [[ws], [inviter]] = await Promise.all([
      db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, opts.workspaceId)).limit(1),
      db.select({ name: workspaceMembers.name }).from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, opts.workspaceId), eq(workspaceMembers.userId, opts.inviterUserId)))
        .limit(1),
    ])
    await sendWorkspaceInvite({
      to: opts.email,
      workspaceName: ws?.name ?? 'a workspace',
      inviterName: inviter?.name || 'A teammate',
      inviteUrl: inviteUrl(opts.token),
    })
  } catch (err) {
    console.error('[invites] email send failed for', opts.email, err)
    reportError(err, { route: 'invites', email: opts.email })
  }
}
