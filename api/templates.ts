import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, desc } from 'drizzle-orm'
import { requireAuth } from './_lib/auth'
import { requireRole } from './_lib/access'
import { parseBody } from './_lib/validate'
import { TemplateCreate } from './_lib/schemas'
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
      if (!(await requireRole(auth, res, 'editor'))) return
      const body = parseBody(TemplateCreate, req, res)
      if (!body) return
      const { title, department, responsibilities, requirements, tags, uses } = body

      const [created] = await db
        .insert(roleTemplates)
        .values({
          id: crypto.randomUUID(),
          workspaceId: auth.workspaceId,
          title,
          department,
          responsibilities,
          requirements,
          tags,
          uses,
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
