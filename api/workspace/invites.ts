import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, desc } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { track, hasAnalyticsConsent } from '../_lib/analytics'
import { requireRole, ROLE_RANK, getEffectivePlan, sendPlanLimit, getSeatUsage } from '../_lib/access'
import { parseBody } from '../_lib/validate'
import { InviteCreate } from '../_lib/schemas'
import { enforceRateLimit } from '../_lib/rateLimit'
import { db } from '../_lib/db'
import { logAudit } from '../_lib/audit'
import { reportError } from '../_lib/sentry'
import { sendInviteEmail, toInviteView } from '../_lib/invites'
import { newInviteToken } from '../_lib/inviteTokens'
import { workspaceMembers, pendingInvites } from '../../src/lib/db/schema'
import { fitsLimit } from '../../src/lib/plans'

// GET  /api/workspace/invites  — pending invites (admin+)
// POST /api/workspace/invites  — create invites and email single-use links (admin+)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await requireAuth(req, res)
  if (!auth) return

  try {
    const callerPermission = await requireRole(auth, res, 'admin')
    if (!callerPermission) return

    if (req.method === 'GET') {
      const rows = await db.select().from(pendingInvites)
        .where(eq(pendingInvites.workspaceId, auth.workspaceId))
        .orderBy(desc(pendingInvites.sentAt))
      return res.json({ invites: rows.map(r => toInviteView(r)) })
    }

    const body = parseBody(InviteCreate, req, res)
    if (!body) return

    // Invites can only grant roles below the inviter's own (never owner).
    if (body.invites.some(inv => ROLE_RANK[inv.permission] >= ROLE_RANK[callerPermission])) {
      return res.status(403).json({ error: 'You can only invite people with a role below your own' })
    }

    // Invites send email — throttle per workspace to prevent spam relaying.
    if (!(await enforceRateLimit(res, `invites:${auth.workspaceId}`, 10, 60 * 60))) return

    // Skip addresses that are already members or already invited.
    const [existingMembers, existingInvites] = await Promise.all([
      db.select({ email: workspaceMembers.email }).from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, auth.workspaceId)),
      db.select({ email: pendingInvites.email }).from(pendingInvites)
        .where(eq(pendingInvites.workspaceId, auth.workspaceId)),
    ])
    const taken = new Set([...existingMembers, ...existingInvites].map(r => r.email.toLowerCase()))
    const seen = new Set<string>()
    const fresh = body.invites.filter(inv => {
      if (taken.has(inv.email) || seen.has(inv.email)) return false
      seen.add(inv.email)
      return true
    })

    // Seat limit: members + live (unexpired) pending invites + new invites.
    const plan = await getEffectivePlan(auth.workspaceId)
    if (!plan) return res.status(404).json({ error: 'Workspace not found' })
    const seats = await getSeatUsage(auth.workspaceId)
    if (!fitsLimit(plan.limits.seats, seats.members + seats.invites, fresh.length)) {
      return sendPlanLimit(res, 'seats', plan, plan.limits.seats)
    }

    const created = []
    for (const { email, permission } of fresh) {
      const { token, tokenHash, expiresAt } = newInviteToken()
      const [row] = await db
        .insert(pendingInvites)
        .values({ id: crypto.randomUUID(), workspaceId: auth.workspaceId, email, permission, tokenHash, expiresAt, invitedBy: auth.userId })
        .returning()
      created.push(toInviteView(row))
      await logAudit({
        workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'invite.sent',
        targetType: 'invite', targetId: row.id, details: { email, role: permission },
      })
      await sendInviteEmail({ workspaceId: auth.workspaceId, inviterUserId: auth.userId, email, token })
    }

    if (created.length) {
      await track('invite_sent', { userId: auth.userId, workspaceId: auth.workspaceId, consent: hasAnalyticsConsent(req), props: { count: created.length, plan: plan.tier } })
    }

    return res.status(201).json({ invites: created })
  } catch (err) {
    console.error('/api/workspace/invites', err)
    reportError(err, { route: '/api/workspace/invites' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}

