/// <reference types="node" />
import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { reportError } from './sentry'
import { sendBillingAlert } from './email'
import { workspaces } from '../../src/lib/db/schema'

// R-22: refunds and disputes are money events no code should decide about, but a human must hear of them. They are reported
// to Sentry and, when BILLING_ALERT_EMAIL is set (the owner's own address), emailed. Opaque ids and amounts only: no names or emails.

async function workspaceForCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<string | null> {
  const id = typeof customer === 'string' ? customer : customer?.id
  if (!id) return null
  const [ws] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.stripeCustomerId, id)).limit(1)
  return ws?.id ?? null
}

function money(amount: number, currency: string): string {
  return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`
}

export async function alertOwner(subject: string, lines: string[]): Promise<void> {
  reportError(new Error(`${subject}: ${lines.join('; ')}`), { route: '/api/webhooks/stripe', step: 'billing-alert' })
  const to = process.env.BILLING_ALERT_EMAIL
  if (!to) return
  try { await sendBillingAlert({ to, subject, lines }) } catch (err) { reportError(err, { route: '/api/webhooks/stripe', step: 'billing-alert-email' }) }
}

export async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const ws = await workspaceForCustomer(charge.customer)
  await alertOwner('A StratMap payment was refunded', [
    `Charge ${charge.id}`, `Refunded ${money(charge.amount_refunded, charge.currency)} of ${money(charge.amount, charge.currency)}`,
    `Workspace ${ws ?? 'unknown'}`,
    'A refund does not change the plan by itself. If the customer should lose access, cancel the subscription in Stripe.',
  ])
}

export async function handleDisputeCreated(stripe: Stripe, dispute: Stripe.Dispute): Promise<void> {
  let ws: string | null = null
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id
  if (chargeId) {
    try { ws = await workspaceForCustomer((await stripe.charges.retrieve(chargeId)).customer) } catch (err) {
      reportError(err, { route: '/api/webhooks/stripe', step: 'dispute-charge-lookup' })
    }
  }
  await alertOwner('A StratMap payment was disputed', [
    `Dispute ${dispute.id} on charge ${chargeId ?? 'unknown'}`, `${money(dispute.amount, dispute.currency)}, reason: ${dispute.reason}`,
    `Workspace ${ws ?? 'unknown'}`,
    'Respond with evidence in the Stripe dashboard before the deadline shown there.',
  ])
}
