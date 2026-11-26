import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { reportError } from './sentry'
import { logAudit } from './audit'
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
  /** Identifies the invite in error reports (R-72): never the address itself. */
  inviteId: string
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
    // The invite's id, never the invitee's address (R-72): error reports are not a place for personal data.
    console.error('[invites] email send failed for invite', opts.inviteId, err)
    reportError(err, { route: 'invites', inviteId: opts.inviteId })
  }
}

/**
 * Withdraws the invites a person sent when they stop being a member (removed, or they left), so a link they made
 * cannot be used for a week after they lost the right to invite (R-33). Each one is logged as revoked.
 */
export async function revokeInvitesSentBy(workspaceId: string, userId: string, actorUserId: string): Promise<number> {
  const gone = await db.delete(pendingInvites)
    .where(and(eq(pendingInvites.workspaceId, workspaceId), eq(pendingInvites.invitedBy, userId)))
    .returning()
  for (const invite of gone) {
    await logAudit({
      workspaceId, actorUserId, action: 'invite.revoked', targetType: 'invite', targetId: invite.id,
      details: { email: invite.email, role: invite.permission, reason: 'inviter-left' },
    })
  }
  return gone.length
}
