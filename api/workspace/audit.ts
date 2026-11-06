import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, desc, eq, lt } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { requireRole, requireFeature } from '../_lib/access'
import { db } from '../_lib/db'
import { auditLog, workspaceMembers } from '../../src/lib/db/schema'
import { toCsv, type CsvCell } from '../../src/lib/csvText'

// Audit log (roadmap 4.4). Owners and admins can read it (owner-decided); the CSV download is an
// Enterprise feature ('audit-export'). Salary events never carry amounts (see api/_lib/audit.ts).
//   GET /api/workspace/audit?limit=50&before=<ISO time>   → { events, nextBefore }
//   GET /api/workspace/audit?format=csv                   → the whole log as CSV (Enterprise)

const PAGE_DEFAULT = 50
const PAGE_MAX = 200
const CSV_MAX_ROWS = 10_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await requireAuth(req, res)
  if (!auth) return

  try {
    if (!(await requireRole(auth, res, 'admin'))) return

    const csv = req.query.format === 'csv'
    if (csv && !(await requireFeature(auth.workspaceId, res, 'audit-export'))) return

    const limit = csv
      ? CSV_MAX_ROWS
      : Math.min(Math.max(parseInt(String(req.query.limit ?? ''), 10) || PAGE_DEFAULT, 1), PAGE_MAX)
    const beforeRaw = typeof req.query.before === 'string' ? new Date(req.query.before) : null
    const before = beforeRaw && !Number.isNaN(beforeRaw.getTime()) ? beforeRaw : null

    const rows = await db.select().from(auditLog)
      .where(and(eq(auditLog.workspaceId, auth.workspaceId), before ? lt(auditLog.createdAt, before) : undefined))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(limit + 1)
    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)

    // Who did it: resolved from the current member list; people who have since left show as null.
    const members = await db.select({ userId: workspaceMembers.userId, name: workspaceMembers.name, email: workspaceMembers.email })
      .from(workspaceMembers).where(eq(workspaceMembers.workspaceId, auth.workspaceId))
    const byId = new Map(members.map(m => [m.userId, m]))
    const events = page.map(r => {
      const actor = byId.get(r.actorUserId)
      return {
        id: r.id,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        details: r.details,
        actor: { userId: r.actorUserId, name: actor?.name ?? null, email: actor?.email ?? null },
        createdAt: r.createdAt.toISOString(),
      }
    })

    if (csv) {
      const header: CsvCell[] = ['Time (UTC)', 'Actor', 'Actor email', 'Action', 'Target type', 'Target id', 'Details']
      const body: CsvCell[][] = events.map(e => [
        e.createdAt, e.actor.name ?? e.actor.userId, e.actor.email ?? '', e.action, e.targetType, e.targetId ?? '', JSON.stringify(e.details),
      ])
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"')
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).end(toCsv([header, ...body]))
    }

    res.setHeader('Cache-Control', 'no-store')
    return res.json({ events, nextBefore: hasMore ? events[events.length - 1].createdAt : null })
  } catch (err) {
    console.error('/api/workspace/audit', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
