import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { requireRole, ROLE_RANK } from '../../_lib/access'
import { parseBody } from '../../_lib/validate'
import { MemberUpdate } from '../../_lib/schemas'
import { db } from '../../_lib/db'
import { workspaceMembers } from '../../../src/lib/db/schema'
import { logAudit } from '../../_lib/audit'

// Members are managed by admins+. A caller may only act on members ranked
// strictly below themselves, and may only grant roles strictly below their own
// (so admins cannot create or demote other admins; nobody can mint an owner).

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    if (req.method !== 'PUT' && req.method !== 'DELETE') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const callerPermission = await requireRole(auth, res, 'admin')
    if (!callerPermission) return
    const callerRank = ROLE_RANK[callerPermission]

    const targetUserId = req.query.userId as string
    if (targetUserId === auth.userId) {
      return res.status(403).json({ error: 'You cannot change your own membership' })
    }

    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, auth.workspaceId),
        eq(workspaceMembers.userId, targetUserId),
      ))
      .limit(1)

    if (!member) return res.status(404).json({ error: 'Member not found' })
    if (member.permission === 'owner') return res.status(403).json({ error: 'Cannot modify workspace owner' })
    if (ROLE_RANK[member.permission] >= callerRank) {
      return res.status(403).json({ error: 'You can only manage members below your own role' })
    }

    if (req.method === 'PUT') {
      const body = parseBody(MemberUpdate, req, res)
      if (!body) return
      if (ROLE_RANK[body.permission] >= callerRank) {
        return res.status(403).json({ error: 'You can only grant roles below your own' })
      }

      const [updated] = await db
        .update(workspaceMembers)
        .set({ permission: body.permission })
        .where(and(
          eq(workspaceMembers.workspaceId, auth.workspaceId),
          eq(workspaceMembers.userId, targetUserId),
        ))
        .returning()

      await logAudit({
        workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'member.role_changed',
        targetType: 'member', targetId: targetUserId,
        details: { email: member.email, from: member.permission, to: body.permission },
      })
      return res.json(updated)
    }

    await db
      .delete(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, auth.workspaceId),
        eq(workspaceMembers.userId, targetUserId),
      ))
    await logAudit({
      workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'member.removed',
      targetType: 'member', targetId: targetUserId, details: { email: member.email, role: member.permission },
    })
    return res.status(204).end()
  } catch (err) {
    console.error('/api/workspace/members/[userId]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
