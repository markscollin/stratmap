import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../_lib/db'
import { parseBody } from '../_lib/validate'
import { GrantTrial } from '../_lib/schemas'
import { enforceRateLimit, clientIp } from '../_lib/rateLimit'
import { workspaces } from '../../src/lib/db/schema'

// Constant-time comparison so the secret can't be recovered via response timing.
function secretMatches(provided: unknown): boolean {
  const expected = process.env.ADMIN_SECRET
  if (!expected || typeof provided !== 'string') return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Throttle before checking the secret to blunt brute-force attempts.
    if (!(await enforceRateLimit(res, `admin:${clientIp(req)}`, 10, 60))) return

    if (!secretMatches(req.headers['x-admin-secret'])) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const body = parseBody(GrantTrial, req, res)
    if (!body) return
    const { workspaceId, planTier, days } = body
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + days)

    const [updated] = await db
      .update(workspaces)
      .set({ trialPlan: planTier, trialEndsAt, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning()

    if (!updated) return res.status(404).json({ error: 'Workspace not found' })

    return res.json({
      workspaceId: updated.id,
      trialPlan: updated.trialPlan,
      trialEndsAt: updated.trialEndsAt,
    })
  } catch (err) {
    console.error('/api/admin/grant-trial', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
