import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { requireRole, ROLE_RANK, getEffectivePlan, getSeatUsage, sendPlanLimit } from '../../_lib/access'
import { enforceRateLimit } from '../../_lib/rateLimit'
import { db } from '../../_lib/db'
import { logAudit } from '../../_lib/audit'
import { reportError } from '../../_lib/sentry'
import { sendInviteEmail, toInviteView } from '../../_lib/invites'
import { newInviteToken, isExpired } from '../../_lib/inviteTokens'
import { fitsLimit } from '../../../src/lib/plans'
import { Id } from '../../_lib/schemas'
import { pendingInvites } from '../../../src/lib/db/schema'

// DELETE /api/workspace/invites/:id  — revoke (admin+)
// POST   /api/workspace/invites/:id  — resend: new token + expiry, old link stops working (admin+)
// Like member management, a caller may only act on invites for roles below their own.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await requireAuth(req, res)
  if (!auth) return

  try {
    const callerPermission = await requireRole(auth, res, 'admin')
    if (!callerPermission) return

    const id = Id.safeParse(req.query.id)
    if (!id.success) return res.status(404).json({ error: 'Invite not found' })
    const where = and(eq(pendingInvites.id, id.data), eq(pendingInvites.workspaceId, auth.workspaceId))

    const [invite] = await db.select().from(pendingInvites).where(where).limit(1)
    if (!invite) return res.status(404).json({ error: 'Invite not found' })
    if (ROLE_RANK[invite.permission] >= ROLE_RANK[callerPermission]) {
      return res.status(403).json({ error: 'You can only manage invites for roles below your own' })
    }

    if (req.method === 'DELETE') {
      await db.delete(pendingInvites).where(where)
      await logAudit({
        workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'invite.revoked',
        targetType: 'invite', targetId: invite.id, details: { email: invite.email, role: invite.permission },
      })
      return res.status(204).end()
    }

    // An expired invite holds no seat, so resending it takes one (roadmap 1.5).
    if (isExpired(invite.expiresAt)) {
      const plan = await getEffectivePlan(auth.workspaceId)
      if (!plan) return res.status(404).json({ error: 'Workspace not found' })
      const seats = await getSeatUsage(auth.workspaceId)
      if (!fitsLimit(plan.limits.seats, seats.members + seats.invites)) {
        return sendPlanLimit(res, 'seats', plan, plan.limits.seats)
      }
    }

    // Resend shares the per-workspace email budget with invite creation.
    if (!(await enforceRateLimit(res, `invites:${auth.workspaceId}`, 10, 60 * 60))) return

    const { token, tokenHash, expiresAt } = newInviteToken()
    const [updated] = await db
      .update(pendingInvites)
      .set({ tokenHash, expiresAt, sentAt: new Date(), invitedBy: auth.userId })
      .where(where)
      .returning()
    await sendInviteEmail({ workspaceId: auth.workspaceId, inviterUserId: auth.userId, email: updated.email, token })
    await logAudit({
      workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'invite.resent',
      targetType: 'invite', targetId: updated.id, details: { email: updated.email, role: updated.permission },
    })
    return res.json(toInviteView(updated))
  } catch (err) {
    console.error('/api/workspace/invites/[id]', err)
    reportError(err, { route: '/api/workspace/invites/[id]' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
