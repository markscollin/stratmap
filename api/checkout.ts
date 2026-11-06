import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { requireAuth } from './_lib/auth'
import { requireRole } from './_lib/access'
import { parseBody } from './_lib/validate'
import { CheckoutCreate } from './_lib/schemas'
import { reportError } from './_lib/sentry'
import { getAppUrl } from './_lib/url'
import { db } from './_lib/db'
import { createPortalSession, priceIdFor } from './_lib/billing'
import { workspaces } from '../src/lib/db/schema'
import { hasAnalyticsConsent } from './_lib/analytics'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    // Billing is an admin action.
    if (!(await requireRole(auth, res, 'admin'))) return
    const body = parseBody(CheckoutCreate, req, res)
    if (!body) return
    const { tier, billingCycle } = body

    // Dev mode: no Stripe key configured — simulate successful checkout
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.json({ url: `/billing/success?plan=${tier}` })
    }

    const priceId = priceIdFor(tier, billingCycle)
    if (!priceId) {
      return res.status(400).json({ error: `No price configured for ${tier}/${billingCycle}` })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const appUrl = getAppUrl()

    const [ws] = await db
      .select({ stripeCustomerId: workspaces.stripeCustomerId, stripeSubscriptionId: workspaces.stripeSubscriptionId })
      .from(workspaces).where(eq(workspaces.id, auth.workspaceId)).limit(1)

    // A workspace that already subscribes changes plan in the Customer Portal.
    // A second Checkout would start a second, parallel subscription.
    if (ws?.stripeSubscriptionId && ws.stripeCustomerId) {
      return res.json({ url: await createPortalSession(stripe, ws.stripeCustomerId), portal: true })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse the customer after a cancellation, so invoices stay in one place.
      ...(ws?.stripeCustomerId ? { customer: ws.stripeCustomerId } : {}),
      client_reference_id: auth.workspaceId,
      // The tier is derived from the price id by the webhook; metadata only links the workspace.
      // `analyticsUser` is set only if the buyer accepted analytics: the webhook (no browser) needs it
      // to know it may send the 'upgraded' event, and for whom. It is the opaque user id, nothing else.
      metadata: { workspaceId: auth.workspaceId, ...(hasAnalyticsConsent(req) ? { analyticsUser: auth.userId } : {}) },
      subscription_data: { metadata: { workspaceId: auth.workspaceId } },
      allow_promotion_codes: true,
      success_url: `${appUrl}/billing/success?plan=${tier}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
    })

    if (!session.url) return res.status(500).json({ error: 'Failed to create checkout session' })

    return res.json({ url: session.url })
  } catch (err) {
    console.error('/api/checkout', err)
    reportError(err, { route: '/api/checkout' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
