import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { db } from '../_lib/db'
import { reportError } from '../_lib/sentry'
import { workspaces } from '../../src/lib/db/schema'

// Disable body parsing so we can verify the Stripe signature against raw bytes
export const config = { api: { bodyParser: false } }

type PlanTier = 'free' | 'starter' | 'growth' | 'enterprise'

function getTierFromPriceId(priceId: string): PlanTier | null {
  const map: Record<string, PlanTier> = {
    [process.env.STRIPE_STARTER_MONTHLY_PRICE_ID ?? '__none__']: 'starter',
    [process.env.STRIPE_STARTER_ANNUAL_PRICE_ID  ?? '__none__']: 'starter',
    [process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID  ?? '__none__']: 'growth',
    [process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID   ?? '__none__']: 'growth',
  }
  return map[priceId] ?? null
}

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const sig = req.headers['stripe-signature']
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
    return res.status(400).json({ error: 'Stripe not configured' })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  let event: Stripe.Event

  // In production Vercel Functions, bodyParser:false lets us read the raw stream
  // and verify the Stripe signature byte-for-byte.
  // In vercel dev, the body is pre-parsed as JSON before our handler runs —
  // so the stream is empty. We skip signature verification locally since
  // localhost is not publicly accessible to attackers.
  const rawBody = await getRawBody(req)

  if (rawBody.length > 0 && sig) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
    } catch (err) {
      console.error('[stripe] signature verification failed:', err)
      return res.status(400).json({ error: 'Invalid signature' })
    }
  } else if (req.body && typeof req.body === 'object') {
    // vercel dev pre-parsed the body — safe to skip verification in local dev only
    if (process.env.VERCEL_ENV === 'production') {
      console.error('[stripe] could not read raw body in production')
      return res.status(400).json({ error: 'Could not read raw body' })
    }
    console.warn('[stripe] skipping signature verification in dev mode')
    event = req.body as Stripe.Event
  } else {
    return res.status(400).json({ error: 'Missing body or signature' })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const workspaceId = session.metadata?.workspaceId
        const planTier = session.metadata?.planTier as PlanTier | undefined

        if (!workspaceId || !planTier) {
          console.error('[stripe] checkout.session.completed missing metadata:', session.id)
          break
        }

        await db.update(workspaces)
          .set({
            planTier,
            stripeCustomerId: session.customer as string | null,
            stripeSubscriptionId: session.subscription as string | null,
            updatedAt: new Date(),
          })
          .where(eq(workspaces.id, workspaceId))

        console.log(`[stripe] workspace ${workspaceId} upgraded to ${planTier}`)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await db.update(workspaces)
          .set({ planTier: 'free', stripeSubscriptionId: null, updatedAt: new Date() })
          .where(eq(workspaces.stripeSubscriptionId, sub.id))

        console.log(`[stripe] subscription ${sub.id} cancelled → downgraded to free`)
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const priceId = sub.items.data[0]?.price.id
        if (!priceId) break

        const newTier = getTierFromPriceId(priceId)
        if (!newTier) break

        await db.update(workspaces)
          .set({ planTier: newTier, updatedAt: new Date() })
          .where(eq(workspaces.stripeSubscriptionId, sub.id))

        console.log(`[stripe] subscription ${sub.id} updated → ${newTier}`)
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('[stripe] webhook handler error:', err)
    reportError(err, { route: '/api/webhooks/stripe', eventType: event.type })
    return res.status(500).json({ error: 'Webhook handler failed' })
  }

  return res.json({ received: true })
}
