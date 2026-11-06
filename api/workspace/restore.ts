import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../_lib/auth'
import { parseBody } from '../_lib/validate'
import { WorkspaceRestore } from '../_lib/schemas'
import { restoreWorkspace } from '../_lib/workspaceLifecycle'

// POST /api/workspace/restore { workspaceId } — the owner brings back a workspace they deleted, within 30 days (roadmap 4.2).
// Uses requireUser, not requireAuth: a deleted workspace is invisible to requireAuth, which is the point.
const MESSAGES = {
  'not-found': 'That workspace cannot be restored.',
  expired: 'The 30 days to restore this workspace have passed.',
  'owns-another-workspace': 'You already own another workspace. Delete it first, then restore this one.',
} as const

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const user = await requireUser(req, res)
  if (!user) return
  try {
    const body = parseBody(WorkspaceRestore, req, res)
    if (!body) return
    const result = await restoreWorkspace(body.workspaceId, user.userId)
    if (result.ok) return res.json({ restored: true })
    const status = result.error === 'not-found' ? 404 : result.error === 'expired' ? 410 : 409
    return res.status(status).json({ error: result.error, message: MESSAGES[result.error] })
  } catch (err) {
    console.error('/api/workspace/restore', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
