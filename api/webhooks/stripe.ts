import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../_lib/db'
import { reportError } from '../_lib/sentry'
import { sendPaymentFailed } from '../_lib/email'
import { getAppUrl } from '../_lib/url'
import { invoiceSubscriptionId, syncSubscription } from '../_lib/billing'
import { claimEvent, markProcessed, releaseClaim, emailsAlreadySent, markEmailsSent } from '../_lib/stripeEvents'
import { workspaces, workspaceMembers } from '../../src/lib/db/schema'
import { track } from '../_lib/analytics'

// Disable body parsing so we can verify the Stripe signature against raw bytes
export const config = { api: { bodyParser: false } }

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
    // vercel dev pre-parsed the body — safe to skip verification in local dev only,
    // never on a deployed (preview or production) function.
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development') {
      console.error('[stripe] could not read raw body on a deployed function')
      return res.status(400).json({ error: 'Could not read raw body' })
    }
    console.warn('[stripe] skipping signature verification in dev mode')
    event = req.body as Stripe.Event
  } else {
    return res.status(400).json({ error: 'Missing body or signature' })
  }

  if (!HANDLED_EVENTS.has(event.type)) return res.json({ received: true })

  // Idempotency (roadmap 1.4) that survives a crash (R-06): see api/_lib/stripeEvents.ts.
  let claimed = false
  try {
    const claim = await claimEvent(event.id, event.type)
    if (claim === 'duplicate') return res.json({ received: true, duplicate: true })
    // Another delivery is working on it. A 409 makes Stripe retry later: if that delivery dies, the retry takes over.
    if (claim === 'in-progress') return res.status(409).json({ error: 'in-progress' })
    claimed = true

    await handleEvent(stripe, event)
    await markProcessed(event.id)
  } catch (err) {
    // Give the claim up so Stripe's retry processes the event again at once.
    if (claimed) await releaseClaim(event.id).catch(() => {})
    console.error('[stripe] webhook handler error:', err)
    reportError(err, { route: '/api/webhooks/stripe', eventType: event.type })
    return res.status(500).json({ error: 'Webhook handler failed' })
  }

  return res.json({ received: true })
}

const HANDLED_EVENTS = new Set<string>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
])

// Every handler re-reads the subscription from Stripe (syncSubscription), so the
// order events arrive in doesn't matter. The tier comes from the price id.
async function handleEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const workspaceId = session.metadata?.workspaceId ?? session.client_reference_id ?? undefined
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
      if (session.mode !== 'subscription' || !workspaceId || !subscriptionId) {
        console.error('[stripe] checkout.session.completed without workspace or subscription:', session.id)
        return
      }
      const result = await syncSubscription(stripe, subscriptionId, { workspaceId })
      if (result) console.log(`[stripe] workspace ${result.workspaceId} subscribed → ${result.tier}`)
      // Funnel: first paid plan. Only if the buyer accepted analytics when they started checkout.
      const analyticsUser = session.metadata?.analyticsUser
      if (result && analyticsUser && result.tier !== 'free') {
        await track('upgraded', { userId: analyticsUser, workspaceId: result.workspaceId, consent: true, props: { plan: result.tier } })
      }
      return
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const result = await syncSubscription(stripe, event.data.object.id)
      if (result && result.tier !== result.previousTier) {
        console.log(`[stripe] workspace ${result.workspaceId} ${result.previousTier} → ${result.tier} (${result.status})`)
      }
      return
    }

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const subscriptionId = invoiceSubscriptionId(invoice)
      if (!subscriptionId) return
      const result = await syncSubscription(stripe, subscriptionId)
      // Email on the first failed renewal attempt only; the banner covers the
      // rest. A first payment that fails is handled by Checkout itself.
      if (
        result && event.type === 'invoice.payment_failed'
        && invoice.attempt_count === 1 && invoice.billing_reason !== 'subscription_create'
      ) {
        // A retry of this event (after a crash) must not email twice.
        if (!(await emailsAlreadySent(event.id))) {
          await emailAdminsPaymentFailed(result.workspaceId, invoice)
          await markEmailsSent(event.id)
        }
      }
      return
    }
  }
}

async function emailAdminsPaymentFailed(workspaceId: string, invoice: Stripe.Invoice): Promise<void> {
  const [ws] = await db.select({ name: workspaces.name, planTier: workspaces.planTier })
    .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
  if (!ws) return
  const admins = await db.select({ email: workspaceMembers.email })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.permission, ['owner', 'admin'])))

  const planName = ws.planTier.charAt(0).toUpperCase() + ws.planTier.slice(1)
  const nextAttempt = invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : null
  const manageUrl = `${getAppUrl()}/settings?tab=billing`
  for (const { email } of admins) {
    if (!email) continue
    // One bad address must not fail the webhook (and trigger a replay of the others).
    try {
      await sendPaymentFailed({ to: email, workspaceName: ws.name, planName, nextAttempt, manageUrl })
    } catch (err) {
      reportError(err, { route: '/api/webhooks/stripe', step: 'payment-failed-email' })
    }
  }
}
