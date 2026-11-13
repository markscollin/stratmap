import { and, eq, isNull } from 'drizzle-orm'
import { db } from './db'
import { stripeEvents } from '../../src/lib/db/schema'

// Idempotency for Stripe webhook deliveries (roadmap 1.4), made recoverable (launch review R-06).
//
// A delivery CLAIMS the event id before it does any work, and marks it PROCESSED at the end.
//   - id unknown                      → claimed: do the work.
//   - claimed and processed           → duplicate: answer 200, do nothing.
//   - claimed, not processed, fresh   → another delivery is working on it: answer 409 so Stripe retries later.
//   - claimed, not processed, stale   → that delivery crashed or timed out (nothing says it will ever finish):
//                                        take the claim over and do the work. Handlers re-read Stripe, so repeating is safe.
// Before this, a crash left the claim in place and every retry was answered "duplicate" forever, so a customer
// could pay and never be upgraded (checkout.session.completed was the only event that linked the workspace).

/** A claim that has not been completed for this long belongs to a delivery that died. Function limits are well under this. */
export const CLAIM_STALE_MS = 60_000

export type Claim = 'claimed' | 'duplicate' | 'in-progress'

export async function claimEvent(id: string, type: string, now = new Date()): Promise<Claim> {
  const inserted = await db.insert(stripeEvents).values({ id, type, receivedAt: now }).onConflictDoNothing().returning({ id: stripeEvents.id })
  if (inserted.length) return 'claimed'

  const [row] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, id)).limit(1)
  if (!row) return claimEvent(id, type, now)        // deleted between the two statements: try again
  if (row.processedAt) return 'duplicate'
  if (now.getTime() - row.receivedAt.getTime() < CLAIM_STALE_MS) return 'in-progress'

  // Take over. Compare-and-set on the old `receivedAt`, so two retries arriving together cannot both win.
  const won = await db.update(stripeEvents)
    .set({ receivedAt: now })
    .where(and(eq(stripeEvents.id, id), isNull(stripeEvents.processedAt), eq(stripeEvents.receivedAt, row.receivedAt)))
    .returning({ id: stripeEvents.id })
  return won.length ? 'claimed' : 'in-progress'
}

export async function markProcessed(id: string, now = new Date()): Promise<void> {
  await db.update(stripeEvents).set({ processedAt: now }).where(eq(stripeEvents.id, id))
}

/** Gives up a claim after a failure so Stripe's retry can take it at once (it is made stale rather than deleted, which keeps `emailsSentAt`). */
export async function releaseClaim(id: string): Promise<void> {
  await db.update(stripeEvents)
    .set({ receivedAt: new Date(0) })
    .where(and(eq(stripeEvents.id, id), isNull(stripeEvents.processedAt)))
}

export async function emailsAlreadySent(id: string): Promise<boolean> {
  const [row] = await db.select({ at: stripeEvents.emailsSentAt }).from(stripeEvents).where(eq(stripeEvents.id, id)).limit(1)
  return !!row?.at
}

export async function markEmailsSent(id: string): Promise<void> {
  await db.update(stripeEvents).set({ emailsSentAt: new Date() }).where(eq(stripeEvents.id, id))
}
