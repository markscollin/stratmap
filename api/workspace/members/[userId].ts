import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { db } from '../../_lib/db'
import { workspaceMembers, permissionEnum } from '../../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const targetUserId = req.query.userId as string

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

    if (req.method === 'PUT') {
      const { permission } = req.body as { permission?: string }
      if (!permission) return res.status(400).json({ error: 'permission is required' })

      const [updated] = await db
        .update(workspaceMembers)
        .set({ permission: permission as (typeof permissionEnum.enumValues)[number] })
        .where(and(
          eq(workspaceMembers.workspaceId, auth.workspaceId),
          eq(workspaceMembers.userId, targetUserId),
        ))
        .returning()

      return res.json(updated)
    }

    if (req.method === 'DELETE') {
      await db
        .delete(workspaceMembers)
        .where(and(
          eq(workspaceMembers.workspaceId, auth.workspaceId),
          eq(workspaceMembers.userId, targetUserId),
        ))
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/workspace/members/[userId]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
