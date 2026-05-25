import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { requireAuth } from './_lib/auth'
import { reportError } from './_lib/sentry'
import { getAppUrl } from './_lib/url'

// Read price ids at request time (not module load) so the lookup reflects the
// current environment and stays testable.
function getPriceId(tier: string, billingCycle: string): string | undefined {
  const ids: Record<string, Record<string, string | undefined>> = {
    starter: {
      monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
      annual:  process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
    },
    growth: {
      monthly: process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID,
      annual:  process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
    },
  }
  return ids[tier]?.[billingCycle] || undefined
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const { tier, billingCycle } = req.body as { tier?: string; billingCycle?: string }
    if (!tier || !billingCycle) {
      return res.status(400).json({ error: 'tier and billingCycle are required' })
    }

    // Dev mode: no Stripe key configured — simulate successful checkout
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.json({ url: `/billing/success?plan=${tier}` })
    }

    const priceId = getPriceId(tier, billingCycle)
    if (!priceId) {
      return res.status(400).json({ error: `No price configured for ${tier}/${billingCycle}` })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const appUrl = getAppUrl()

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { workspaceId: auth.workspaceId, planTier: tier },
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
