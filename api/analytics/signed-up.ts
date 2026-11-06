import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../_lib/auth'
import { hasAnalyticsConsent, track } from '../_lib/analytics'

// POST /api/analytics/signed-up — the browser calls this the first time a signed-in person has no
// workspace yet (they are about to see onboarding). The server has no sign-up hook of its own
// (Clerk owns sign-up), so this is the earliest point it can see a new user. Sent once per user
// (deterministic event id), and only if they accepted analytics.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const user = await requireUser(req, res)
    if (!user) return
    await track('signed_up', { userId: user.userId, consent: hasAnalyticsConsent(req) })
    return res.status(204).end()
  } catch (err) {
    console.error('/api/analytics/signed-up', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
