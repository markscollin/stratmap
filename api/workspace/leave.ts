import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { getPermission } from '../_lib/access'
import { logAudit } from '../_lib/audit'
import { db } from '../_lib/db'
import { workspaceMembers } from '../../src/lib/db/schema'

// POST /api/workspace/leave — a member leaves the workspace they are acting in, keeping their account and their other
// workspaces (roadmap 5). The owner cannot leave: a workspace always has its owner, so they delete it instead (a deleted
// workspace can be restored for 30 days). Comments and other content they wrote stay with the workspace.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const permission = await getPermission(auth)
    if (!permission) return res.status(403).json({ error: 'not-a-member' })
    if (permission === 'owner') {
      return res.status(403).json({
        error: 'owner-cannot-leave',
        message: 'The owner cannot leave a workspace. Delete the workspace instead; you can restore it for 30 days.',
      })
    }
    await db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, auth.workspaceId), eq(workspaceMembers.userId, auth.userId)))
    // No personal data in the entry: the person is shown by id, and as "A former member" once the row is gone.
    await logAudit({
      workspaceId: auth.workspaceId, actorUserId: auth.userId, action: 'member.left',
      targetType: 'member', targetId: auth.userId, details: { role: permission },
    })
    return res.status(204).end()
  } catch (err) {
    console.error('/api/workspace/leave', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
