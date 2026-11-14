import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { and, eq, isNull } from 'drizzle-orm'
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
import { isDevBypassAllowed } from './_lib/devBypass'

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

    // No Stripe key: pretend the purchase worked ONLY in explicit local dev (R-20). Anywhere else this is a
    // misconfiguration, and showing "Welcome to Starter" for a purchase that never happened would be worse than an error.
    if (!process.env.STRIPE_SECRET_KEY) {
      if (isDevBypassAllowed()) return res.json({ url: `/billing/success?plan=${tier}` })
      console.error('[checkout] STRIPE_SECRET_KEY is not set on a deployed environment')
      reportError(new Error('STRIPE_SECRET_KEY is not set'), { route: '/api/checkout' })
      return res.status(503).json({ error: 'billing-unavailable', message: 'Billing is not available right now. Please try again later or contact support.' })
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

    // One Stripe customer per workspace, made before Checkout (R-19): two Checkouts opened at once then belong to the
    // same customer, so the second payment is recognisable as a duplicate. The idempotency key makes two simultaneous
    // requests get the very same customer back instead of creating two. Only the opaque workspace id is stored on it.
    let customerId = ws?.stripeCustomerId ?? null
    if (!customerId) {
      const created = await stripe.customers.create(
        { metadata: { workspaceId: auth.workspaceId } },
        { idempotencyKey: `customer-${auth.workspaceId}` },
      )
      customerId = created.id
      await db.update(workspaces).set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(and(eq(workspaces.id, auth.workspaceId), isNull(workspaces.stripeCustomerId)))
      // If another request saved a different id first, use that one (the row is the truth).
      const [saved] = await db.select({ id: workspaces.stripeCustomerId }).from(workspaces).where(eq(workspaces.id, auth.workspaceId)).limit(1)
      if (saved?.id) customerId = saved.id
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer: customerId,
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
