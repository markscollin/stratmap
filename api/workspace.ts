import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth, requireUser } from './_lib/auth'
import { db } from './_lib/db'
import { workspaces, workspaceMembers } from '../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const [ws] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, auth.workspaceId))
        .limit(1)

      if (!ws) return res.status(404).json({ error: 'Workspace not found' })

      const members = await db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, auth.workspaceId))

      return res.json({ ...ws, members })
    }

    if (req.method === 'POST') {
      // Called from onboarding — no workspace exists yet, so use requireUser not requireAuth
      const user = await requireUser(req, res)
      if (!user) return

      const { name, ownerRole, size } = req.body as {
        name: string
        ownerRole: string
        size: string
      }

      if (!name || !ownerRole || !size) {
        return res.status(400).json({ error: 'name, ownerRole, and size are required' })
      }

      // Guard: if user already has a workspace, return it instead of creating a duplicate
      const [existing] = await db
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, user.userId))
        .limit(1)

      if (existing) {
        const [ws] = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, existing.workspaceId))
          .limit(1)
        return res.status(200).json(ws)
      }

      const workspaceId = crypto.randomUUID()

      const [ws] = await db
        .insert(workspaces)
        .values({ id: workspaceId, name, ownerId: user.userId, ownerRole, size })
        .returning()

      await db.insert(workspaceMembers).values({
        id: crypto.randomUUID(),
        workspaceId,
        userId: user.userId,
        email: req.body.email ?? '',
        name: req.body.userName ?? '',
        permission: 'owner',
      })

      return res.status(201).json(ws)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/workspace', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
