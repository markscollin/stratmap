import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { requireRole } from '../_lib/access'
import { parseBody } from '../_lib/validate'
import { OwnershipTransfer } from '../_lib/schemas'
import { runAtomically } from '../_lib/atomic'
import { logAudit } from '../_lib/audit'
import { db } from '../_lib/db'
import { workspaceMembers, workspaces } from '../../src/lib/db/schema'

// POST /api/workspace/transfer-ownership  { userId, confirmName }
// The owner hands the workspace to one of its admins and becomes an admin. Rules (all existing ones, applied here):
//  - owner only, and the workspace name must be typed exactly (like deleting it);
//  - the new owner must already be an admin (nobody can be made owner straight from a lower role, as with member roles);
//  - one owned workspace per user (roadmap 1.2): refused with 409 `owns-another-workspace` if the new owner has a live one;
//  - billing stays with the workspace: the subscription and its Stripe customer are not touched, and every admin can manage it.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    if (!(await requireRole(auth, res, 'owner'))) return
    const body = parseBody(OwnershipTransfer, req, res)
    if (!body) return

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, auth.workspaceId)).limit(1)
    if (!ws) return res.status(404).json({ error: 'Workspace not found' })
    if (body.confirmName !== ws.name) {
      return res.status(400).json({ error: 'confirm-name-mismatch', message: 'Type the workspace name exactly to confirm.' })
    }
    if (body.userId === auth.userId) return res.status(400).json({ error: 'already-owner', message: 'You already own this workspace.' })

    const [target] = await db.select().from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, auth.workspaceId), eq(workspaceMembers.userId, body.userId))).limit(1)
    if (!target) return res.status(404).json({ error: 'Member not found' })
    if (target.permission !== 'admin') {
      return res.status(400).json({ error: 'target-not-admin', message: 'Make this person an admin first, then transfer ownership.' })
    }

    const [owned] = await db.select({ id: workspaces.id }).from(workspaces)
      .where(and(eq(workspaces.ownerId, body.userId), isNull(workspaces.deletedAt))).limit(1)
    if (owned) {
      return res.status(409).json({ error: 'owns-another-workspace', message: 'That person already owns another workspace, and each person can own only one.' })
    }

    const [me] = await db.select({ email: workspaceMembers.email }).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, auth.workspaceId), eq(workspaceMembers.userId, auth.userId))).limit(1)

    // One atomic unit, and guarded: the workspace row only changes while the caller is still its owner, and each member
    // row only changes from the role it had when we checked, so two transfers made together cannot leave two owners.
    await runAtomically(d => [
      d.update(workspaces).set({ ownerId: body.userId, updatedAt: new Date() })
        .where(and(eq(workspaces.id, auth.workspaceId), eq(workspaces.ownerId, auth.userId))),
      d.update(workspaceMembers).set({ permission: 'admin' })
        .where(and(eq(workspaceMembers.workspaceId, auth.workspaceId), eq(workspaceMembers.userId, auth.userId), eq(workspaceMembers.permission, 'owner'))),
      d.update(workspaceMembers).set({ permission: 'owner' })
        .where(and(eq(workspaceMembers.workspaceId, auth.workspaceId), eq(workspaceMembers.userId, body.userId), eq(workspaceMembers.permission, 'admin'),
          // only if the first statement really moved the workspace to this person (a second transfer made together matches nothing)
          sql`exists (select 1 from workspaces w where w.id = ${auth.workspaceId} and w.owner_id = ${body.userId})`)),
    ])

    await logAudit({
      workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'workspace.ownership_transferred',
      targetType: 'member', targetId: body.userId, details: { email: target.email, previousOwnerEmail: me?.email ?? null },
    })
    return res.json({ ownerId: body.userId, yourPermission: 'admin' })
  } catch (err) {
    console.error('/api/workspace/transfer-ownership', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
