import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, desc } from 'drizzle-orm'
import { requireAuth } from './_lib/auth'
import { db } from './_lib/db'
import { roleTemplates } from '../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    if (req.method === 'GET') {
      const list = await db
        .select()
        .from(roleTemplates)
        .where(eq(roleTemplates.workspaceId, auth.workspaceId))
        .orderBy(desc(roleTemplates.updatedAt))

      return res.json(list)
    }

    if (req.method === 'POST') {
      const { title, department = '', responsibilities = '', requirements = '', tags = [], uses = 0 } =
        req.body as Partial<typeof roleTemplates.$inferInsert>

      if (!title) return res.status(400).json({ error: 'title is required' })

      const [created] = await db
        .insert(roleTemplates)
        .values({
          id: crypto.randomUUID(),
          workspaceId: auth.workspaceId,
          title,
          department: department ?? '',
          responsibilities: responsibilities ?? '',
          requirements: requirements ?? '',
          tags: tags ?? [],
          uses: uses ?? 0,
          createdBy: auth.userId,
          updatedBy: auth.userId,
        })
        .returning()

      return res.status(201).json(created)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/templates', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
