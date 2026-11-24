import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { requireUser } from '../_lib/auth'
import { enforceRateLimit } from '../_lib/rateLimit'
import { db } from '../_lib/db'
import { reportError } from '../_lib/sentry'
import { getUserIdentity } from '../_lib/identity'
import { workspaces, workspaceMembers, pendingInvites } from '../../src/lib/db/schema'

// GET /api/invites/mine (R-56)
//
// The live invites sent to the caller's VERIFIED email addresses, for the "you've been invited" choice on onboarding. Nothing is
// accepted here: the person sees who invited them to what, and clicks Accept, Decline or "create my own workspace". The inviter's
// email is shown on purpose: a workspace name alone ("VictimCo") is easy to fake, an address is harder.

export interface MyInvite {
  id: string
  workspaceName: string
  inviterName: string | null
  inviterEmail: string | null
  permission: string
  expiresAt: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const user = await requireUser(req, res)
  if (!user) return
  try {
    if (!(await enforceRateLimit(res, `invites-mine:${user.userId}`, 30, 60))) return
    const identity = await getUserIdentity(user.userId)
    if (identity.emails.length === 0) return res.json({ invites: [] })

    const rows = await db.select({
      id: pendingInvites.id, workspaceId: pendingInvites.workspaceId, invitedBy: pendingInvites.invitedBy,
      permission: pendingInvites.permission, expiresAt: pendingInvites.expiresAt, sentAt: pendingInvites.sentAt,
      workspaceName: workspaces.name,
    }).from(pendingInvites)
      .innerJoin(workspaces, and(eq(workspaces.id, pendingInvites.workspaceId), isNull(workspaces.deletedAt)))
      .where(and(
        inArray(pendingInvites.email, identity.emails),
        or(isNull(pendingInvites.expiresAt), gt(pendingInvites.expiresAt, new Date())),
      ))

    // Workspaces the person already belongs to are left out (accepting would only clear the invite).
    const mine = new Set((await db.select({ id: workspaceMembers.workspaceId }).from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.userId))).map(m => m.id))

    const inviterIds = [...new Set(rows.map(r => r.invitedBy).filter((x): x is string => !!x))]
    const inviters = inviterIds.length
      ? await db.select({ workspaceId: workspaceMembers.workspaceId, userId: workspaceMembers.userId, name: workspaceMembers.name, email: workspaceMembers.email })
          .from(workspaceMembers).where(inArray(workspaceMembers.userId, inviterIds))
      : []

    const invites: MyInvite[] = rows
      .filter(r => !mine.has(r.workspaceId))
      .sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0))
      .map(r => {
        const by = inviters.find(i => i.workspaceId === r.workspaceId && i.userId === r.invitedBy)
        return {
          id: r.id, workspaceName: r.workspaceName, inviterName: by?.name || null, inviterEmail: by?.email || null,
          permission: r.permission, expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
        }
      })
    return res.json({ invites })
  } catch (err) {
    console.error('/api/invites/mine', err)
    reportError(err, { route: '/api/invites/mine' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
