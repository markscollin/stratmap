import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and, count } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { requireRole, ROLE_RANK, getEffectivePlan, sendPlanLimit } from '../_lib/access'
import { parseBody } from '../_lib/validate'
import { InviteCreate } from '../_lib/schemas'
import { enforceRateLimit } from '../_lib/rateLimit'
import { db } from '../_lib/db'
import { reportError } from '../_lib/sentry'
import { sendWorkspaceInvite } from '../_lib/email'
import { getAppUrl } from '../_lib/url'
import { workspaces, workspaceMembers, pendingInvites } from '../../src/lib/db/schema'
import { fitsLimit } from '../../src/lib/plans'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await requireAuth(req, res)
  if (!auth) return

  try {
    const callerPermission = await requireRole(auth, res, 'admin')
    if (!callerPermission) return

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

    // Seat limit: members + pending invites + new invites.
    const plan = await getEffectivePlan(auth.workspaceId)
    if (!plan) return res.status(404).json({ error: 'Workspace not found' })
    const [[{ value: memberCount }], [{ value: inviteCount }]] = await Promise.all([
      db.select({ value: count() }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, auth.workspaceId)),
      db.select({ value: count() }).from(pendingInvites).where(eq(pendingInvites.workspaceId, auth.workspaceId)),
    ])
    if (!fitsLimit(plan.limits.seats, memberCount + inviteCount, fresh.length)) {
      return sendPlanLimit(res, 'seats', plan, plan.limits.seats)
    }

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, auth.workspaceId)).limit(1)
    const [inviter] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, auth.workspaceId), eq(workspaceMembers.userId, auth.userId)))
      .limit(1)

    const workspaceName = ws?.name ?? 'a workspace'
    const inviterName = inviter?.name ?? 'A teammate'
    const inviteUrl = `${getAppUrl()}/sign-up`

    const created = []
    for (const { email, permission } of fresh) {
      const [row] = await db
        .insert(pendingInvites)
        .values({ id: crypto.randomUUID(), workspaceId: auth.workspaceId, email, permission })
        .returning()
      created.push(row)

      // Email failures must not fail the request — the invite is already persisted.
      try {
        await sendWorkspaceInvite({ to: email, workspaceName, inviterName, inviteUrl })
      } catch (emailErr) {
        console.error('[invites] email send failed for', email, emailErr)
        reportError(emailErr, { route: '/api/workspace/invites', email })
      }
    }

    return res.status(201).json({ invites: created })
  } catch (err) {
    console.error('/api/workspace/invites', err)
    reportError(err, { route: '/api/workspace/invites' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
