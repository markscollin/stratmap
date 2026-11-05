import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../../../_lib/auth'
import { getPermission, atLeast, type Permission } from '../../../_lib/access'
import { parseBody } from '../../../_lib/validate'
import { JDUpdate, SALARY_FIELDS } from '../../../_lib/schemas'
import { db } from '../../../_lib/db'
import { charts, jobDescriptions } from '../../../../src/lib/db/schema'

// Salary bands are confidential: only admins/owners may read or write them.
function canSeeSalary(permission: Permission | null): boolean {
  return !!permission && atLeast(permission, 'admin')
}

function redactSalary<T extends Record<string, unknown>>(jd: T, permission: Permission | null): T {
  if (canSeeSalary(permission)) return jd
  const copy: Record<string, unknown> = { ...jd }
  for (const f of SALARY_FIELDS) delete copy[f]
  return copy as T
}

// Moving a JD into these states is an approval step (admin+), matching JDPanel.
const ADMIN_ONLY_STATUSES = new Set(['approved', 'published', 'hired'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const chartId = req.query.id as string
    const nodeId = req.query.nodeId as string

    const [chart] = await db
      .select({ id: charts.id })
      .from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId)))
      .limit(1)

    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    const permission = await getPermission(auth)

    if (req.method === 'GET') {
      const [jd] = await db
        .select()
        .from(jobDescriptions)
        .where(and(eq(jobDescriptions.nodeId, nodeId), eq(jobDescriptions.chartId, chartId)))
        .limit(1)

      if (jd) return res.json(redactSalary(jd, permission))

      // No JD persisted yet — return a default so the client avoids a 404 console error
      return res.json({
        id: null,
        nodeId,
        chartId,
        status: 'draft',
        responsibilities: '',
        requirements: '',
        version: 1,
        updatedBy: '',
        updatedAt: new Date().toISOString(),
      })
    }

    if (req.method === 'PUT') {
      if (!permission || !atLeast(permission, 'editor')) {
        return res.status(403).json({ error: 'forbidden', required: 'editor' })
      }
      const body = parseBody(JDUpdate, req, res)
      if (!body) return
      if (SALARY_FIELDS.some(f => body[f] !== undefined) && !canSeeSalary(permission)) {
        return res.status(403).json({ error: 'forbidden', required: 'admin', message: 'Only admins can edit salary bands' })
      }
      if (body.status && ADMIN_ONLY_STATUSES.has(body.status) && !atLeast(permission, 'admin')) {
        return res.status(403).json({ error: 'forbidden', required: 'admin', message: 'Only admins can approve job descriptions' })
      }

      const [existing] = await db
        .select({ id: jobDescriptions.id, version: jobDescriptions.version })
        .from(jobDescriptions)
        .where(and(eq(jobDescriptions.nodeId, nodeId), eq(jobDescriptions.chartId, chartId)))
        .limit(1)

      if (existing) {
        // Only bump version when explicitly requested (e.g. client passes higher version on draft revert)
        const version = body.version !== undefined ? body.version : existing.version
        const [updated] = await db
          .update(jobDescriptions)
          .set({ ...body, version, updatedAt: new Date(), updatedBy: auth.userId })
          .where(eq(jobDescriptions.id, existing.id))
          .returning()
        return res.json(redactSalary(updated, permission))
      }

      const [created] = await db
        .insert(jobDescriptions)
        .values({
          id: crypto.randomUUID(),
          nodeId,
          chartId,
          status: 'draft',
          responsibilities: '',
          requirements: '',
          version: 1,
          updatedBy: auth.userId,
          ...body,
        })
        .returning()

      return res.status(201).json(redactSalary(created, permission))
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/jd/[nodeId]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
