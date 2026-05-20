import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { db } from '../_lib/db'
import { workspaceDepartments } from '../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    if (req.method === 'GET') {
      const rows = await db
        .select()
        .from(workspaceDepartments)
        .where(eq(workspaceDepartments.workspaceId, auth.workspaceId))
      return res.json(rows)
    }

    if (req.method === 'POST') {
      const { name, colour } = req.body as { name: string; colour: string }
      if (!name || !colour) return res.status(400).json({ error: 'name and colour are required' })

      const [dept] = await db
        .insert(workspaceDepartments)
        .values({ id: crypto.randomUUID(), workspaceId: auth.workspaceId, name, colour })
        .returning()
      return res.status(201).json(dept)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/workspace/departments', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
