import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireUser } from '../_lib/auth'
import { parseBody } from '../_lib/validate'
import { InviteDecline } from '../_lib/schemas'
import { enforceRateLimit } from '../_lib/rateLimit'
import { db } from '../_lib/db'
import { logAudit } from '../_lib/audit'
import { reportError } from '../_lib/sentry'
import { getUserIdentity } from '../_lib/identity'
import { pendingInvites } from '../../src/lib/db/schema'

// POST /api/invites/decline { inviteId } (R-56)
//
// The invited person turns an invite down: it is deleted (its seat is freed) and the inviting workspace's activity log says so.
// Only an invite sent to one of the caller's verified addresses; anything else is "not found".

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const user = await requireUser(req, res)
  if (!user) return
  try {
    if (!(await enforceRateLimit(res, `invite-accept:${user.userId}`, 20, 60 * 60))) return
    const body = parseBody(InviteDecline, req, res)
    if (!body) return
    const identity = await getUserIdentity(user.userId)
    const [invite] = await db.select().from(pendingInvites).where(eq(pendingInvites.id, body.inviteId)).limit(1)
    if (!invite || !identity.emails.includes(invite.email.toLowerCase())) {
      return res.status(404).json({ error: 'invite-not-found', message: 'This invite no longer exists.' })
    }
    const [gone] = await db.delete(pendingInvites).where(eq(pendingInvites.id, invite.id)).returning({ id: pendingInvites.id })
    if (gone) {
      await logAudit({
        workspaceId: invite.workspaceId, actorUserId: user.userId, action: 'invite.declined',
        targetType: 'invite', targetId: invite.id, details: { email: invite.email, role: invite.permission },
      })
    }
    return res.json({ declined: true })
  } catch (err) {
    console.error('/api/invites/decline', err)
    reportError(err, { route: '/api/invites/decline' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
