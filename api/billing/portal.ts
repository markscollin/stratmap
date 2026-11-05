import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { requireRole } from '../_lib/access'
import { db } from '../_lib/db'
import { reportError } from '../_lib/sentry'
import { createPortalSession } from '../_lib/billing'
import { workspaces } from '../../src/lib/db/schema'

// POST /api/billing/portal — opens the Stripe Customer Portal (roadmap 1.3), where
// admins update the card, switch plans, cancel and download invoices.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!(await requireRole(auth, res, 'admin'))) return

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'billing-unavailable', message: 'Billing is not configured in this environment.' })
    }

    const [ws] = await db.select({ stripeCustomerId: workspaces.stripeCustomerId })
      .from(workspaces).where(eq(workspaces.id, auth.workspaceId)).limit(1)
    if (!ws?.stripeCustomerId) {
      return res.status(409).json({ error: 'no-billing-account', message: 'This workspace has no billing account yet. Choose a plan first.' })
    }

    const url = await createPortalSession(new Stripe(process.env.STRIPE_SECRET_KEY), ws.stripeCustomerId)
    return res.json({ url })
  } catch (err) {
    console.error('/api/billing/portal', err)
    reportError(err, { route: '/api/billing/portal' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
