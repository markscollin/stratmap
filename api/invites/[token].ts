import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { db } from '../_lib/db'
import { clientIp, enforceRateLimit } from '../_lib/rateLimit'
import { reportError } from '../_lib/sentry'
import { INVITE_TOKEN_RE, hashInviteToken, isExpired } from '../_lib/inviteTokens'
import { workspaces, workspaceMembers, pendingInvites } from '../../src/lib/db/schema'

// GET /api/invites/:token — PUBLIC (no auth). Lets the /invite/:token page show
// "Alex invited you to Acme as an Editor" before the visitor signs in. The token
// itself is the credential; lookups are throttled per IP.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    if (!(await enforceRateLimit(res, `invite-preview:${clientIp(req)}`, 30, 60))) return

    const token = String(req.query.token ?? '')
    if (!INVITE_TOKEN_RE.test(token)) return res.status(404).json({ error: 'invite-not-found' })

    const [invite] = await db.select().from(pendingInvites)
      .where(eq(pendingInvites.tokenHash, hashInviteToken(token))).limit(1)
    if (!invite) return res.status(404).json({ error: 'invite-not-found' })
    if (isExpired(invite.expiresAt)) return res.status(410).json({ error: 'invite-expired' })

    const [[ws], [inviter]] = await Promise.all([
      db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, invite.workspaceId)).limit(1),
      invite.invitedBy
        ? db.select({ name: workspaceMembers.name }).from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, invite.invitedBy)))
            .limit(1)
        : Promise.resolve([]),
    ])

    return res.json({
      workspaceName: ws?.name ?? 'a workspace',
      inviterName: inviter?.name || null,
      email: invite.email,
      permission: invite.permission,
      expiresAt: invite.expiresAt,
    })
  } catch (err) {
    console.error('/api/invites/[token]', err)
    reportError(err, { route: '/api/invites/[token]' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
