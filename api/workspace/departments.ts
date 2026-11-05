import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { requireRole } from '../_lib/access'
import { parseBody } from '../_lib/validate'
import { DepartmentCreate } from '../_lib/schemas'
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
      if (!(await requireRole(auth, res, 'editor'))) return
      const body = parseBody(DepartmentCreate, req, res)
      if (!body) return
      const { name, colour } = body

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
