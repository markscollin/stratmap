import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { db } from '../_lib/db'
import { roleTemplates } from '../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const id = req.query.id as string

    const [template] = await db
      .select({ id: roleTemplates.id })
      .from(roleTemplates)
      .where(and(eq(roleTemplates.id, id), eq(roleTemplates.workspaceId, auth.workspaceId)))
      .limit(1)

    if (!template) return res.status(404).json({ error: 'Template not found' })

    if (req.method === 'PUT') {
      const { title, department, responsibilities, requirements, tags, uses } =
        req.body as Partial<typeof roleTemplates.$inferInsert>

      const [updated] = await db
        .update(roleTemplates)
        .set({
          ...(title !== undefined && { title }),
          ...(department !== undefined && { department }),
          ...(responsibilities !== undefined && { responsibilities }),
          ...(requirements !== undefined && { requirements }),
          ...(tags !== undefined && { tags }),
          ...(uses !== undefined && { uses }),
          updatedBy: auth.userId,
          updatedAt: new Date(),
        })
        .where(eq(roleTemplates.id, id))
        .returning()

      return res.json(updated)
    }

    if (req.method === 'DELETE') {
      await db.delete(roleTemplates).where(eq(roleTemplates.id, id))
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/templates/[id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
