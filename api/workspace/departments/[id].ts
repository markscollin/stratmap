import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { db } from '../../_lib/db'
import { workspaceDepartments } from '../../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const { id } = req.query as { id: string }

    if (req.method === 'PUT') {
      const { name, colour } = req.body as { name?: string; colour?: string }

      const [updated] = await db
        .update(workspaceDepartments)
        .set({ ...(name && { name }), ...(colour && { colour }) })
        .where(and(
          eq(workspaceDepartments.id, id),
          eq(workspaceDepartments.workspaceId, auth.workspaceId),
        ))
        .returning()

      if (!updated) return res.status(404).json({ error: 'Not found' })
      return res.json(updated)
    }

    if (req.method === 'DELETE') {
      await db
        .delete(workspaceDepartments)
        .where(and(
          eq(workspaceDepartments.id, id),
          eq(workspaceDepartments.workspaceId, auth.workspaceId),
        ))
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/workspace/departments/[id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
