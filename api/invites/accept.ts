import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { requireUser } from '../_lib/auth'
import { parseBody } from '../_lib/validate'
import { InviteAccept } from '../_lib/schemas'
import { enforceRateLimit } from '../_lib/rateLimit'
import { db } from '../_lib/db'
import { logAudit } from '../_lib/audit'
import { reportError } from '../_lib/sentry'
import { getUserIdentity } from '../_lib/identity'
import { hashInviteToken, isExpired } from '../_lib/inviteTokens'
import { getEffectivePlan, getSeatUsage } from '../_lib/access'
import { fitsLimit } from '../../src/lib/plans'
import { workspaceMembers, pendingInvites } from '../../src/lib/db/schema'

// POST /api/invites/accept  { token? }
//
// Joins the caller to the invite's workspace with the invited role, then deletes
// the invite (single use). Called by the /invite/:token page, and on sign-in
// before the onboarding redirect (no token → match a pending invite by email).
//
// The invite's email must be one of the caller's VERIFIED email addresses
// (looked up server-side from Clerk), so a forwarded or leaked link can't be
// used by someone else.
//
// A user may belong to several workspaces (roadmap 1.2). The client switches to
// the joined workspace using the returned workspaceId.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireUser(req, res)
  if (!user) return

  try {
    if (!(await enforceRateLimit(res, `invite-accept:${user.userId}`, 20, 60 * 60))) return

    const body = parseBody(InviteAccept, req, res)
    if (!body) return

    const identity = await getUserIdentity(user.userId)

    let invite: typeof pendingInvites.$inferSelect | undefined
    if (body.token) {
      ;[invite] = await db.select().from(pendingInvites)
        .where(eq(pendingInvites.tokenHash, hashInviteToken(body.token))).limit(1)
      if (!invite) return res.status(404).json({ error: 'invite-not-found', message: 'This invite link is invalid or has already been used.' })
      if (isExpired(invite.expiresAt)) {
        return res.status(410).json({ error: 'invite-expired', message: 'This invite has expired. Ask an admin to resend it.' })
      }
      if (!identity.emails.includes(invite.email.toLowerCase())) {
        return res.status(403).json({
          error: 'invite-email-mismatch',
          email: invite.email,
          message: `This invite was sent to ${invite.email}. Sign in with that address (and verify it) to accept.`,
        })
      }
    } else {
      if (identity.emails.length === 0) return res.status(404).json({ error: 'no-invite' })
      ;[invite] = await db.select().from(pendingInvites)
        .where(and(
          inArray(pendingInvites.email, identity.emails),
          or(isNull(pendingInvites.expiresAt), gt(pendingInvites.expiresAt, new Date())),
        ))
        .orderBy(desc(pendingInvites.sentAt))
        .limit(1)
      if (!invite) return res.status(404).json({ error: 'no-invite' })
    }

    // Users can belong to several workspaces (roadmap 1.2); only a repeat join is a no-op.
    const [membership] = await db.select({ workspaceId: workspaceMembers.workspaceId, permission: workspaceMembers.permission })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, user.userId), eq(workspaceMembers.workspaceId, invite.workspaceId)))
      .limit(1)
    if (membership) {
      await db.delete(pendingInvites).where(eq(pendingInvites.id, invite.id))
      return res.json({ workspaceId: membership.workspaceId, permission: membership.permission, alreadyMember: true })
    }

    // Seats (roadmap 1.5): the invite reserved a seat when it was sent, but a
    // workspace that has since downgraded may have no room left. Keep the invite
    // so it can be accepted once the workspace upgrades or frees a seat.
    const plan = await getEffectivePlan(invite.workspaceId)
    if (plan) {
      const { members } = await getSeatUsage(invite.workspaceId)
      if (!fitsLimit(plan.limits.seats, members)) {
        return res.status(402).json({
          error: 'plan-limit',
          limit: 'seats',
          max: plan.limits.seats,
          tier: plan.tier,
          message: 'This workspace has no free seats on its current plan. Ask a workspace admin to upgrade or free up a seat, then try again.',
        })
      }
    }

    // Claim the invite first: of two concurrent accepts, only one gets the row.
    const [claimed] = await db.delete(pendingInvites).where(eq(pendingInvites.id, invite.id)).returning()
    if (!claimed) return res.status(404).json({ error: 'invite-not-found', message: 'This invite has already been used.' })

    try {
      await db.insert(workspaceMembers).values({
        id: crypto.randomUUID(),
        workspaceId: claimed.workspaceId,
        userId: user.userId,
        email: claimed.email,
        name: identity.name,
        avatarUrl: identity.avatarUrl,
        permission: claimed.permission,
      })
    } catch (err) {
      // Put the invite back so the user can retry.
      await db.insert(pendingInvites).values(claimed).catch(() => {})
      throw err
    }

    await logAudit({
      workspaceId: claimed.workspaceId, actorUserId: user.userId, action: 'member.joined',
      targetType: 'member', targetId: user.userId, details: { email: claimed.email, role: claimed.permission, invitedBy: claimed.invitedBy },
    })
    return res.status(201).json({ workspaceId: claimed.workspaceId, permission: claimed.permission })
  } catch (err) {
    console.error('/api/invites/accept', err)
    reportError(err, { route: '/api/invites/accept' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
