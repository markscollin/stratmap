import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import { reportError } from '../_lib/sentry'
import { purgeExpiredWorkspaces } from '../_lib/workspaceLifecycle'

// Daily job (vercel.json "crons"): erases workspaces that were deleted more than 30 days ago (roadmap 4.2).
// Vercel calls it with `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET set it refuses to run, so it can
// never be triggered by a stranger.
function authorised(req: VercelRequest): boolean {
  const expected = process.env.CRON_SECRET
  const header = req.headers.authorization
  if (!expected || typeof header !== 'string') return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${expected}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.CRON_SECRET) return res.status(503).json({ error: 'not-configured' })
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const purged = await purgeExpiredWorkspaces()
    console.log(`[purge-deleted] erased ${purged} workspace(s)`)
    return res.json({ purged })
  } catch (err) {
    console.error('/api/cron/purge-deleted', err)
    reportError(err, { route: '/api/cron/purge-deleted' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
