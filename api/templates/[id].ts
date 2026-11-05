import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { requireRole } from '../_lib/access'
import { parseBody } from '../_lib/validate'
import { TemplateUpdate } from '../_lib/schemas'
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

    if ((req.method === 'PUT' || req.method === 'DELETE') && !(await requireRole(auth, res, 'editor'))) return

    if (req.method === 'PUT') {
      const body = parseBody(TemplateUpdate, req, res)
      if (!body) return
      const { title, department, responsibilities, requirements, tags, uses } = body

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
