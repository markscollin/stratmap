/// <reference types="node" />
import Stripe from 'stripe'
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import { db } from './db'
import { logAudit } from './audit'
import { sendWorkspaceDeleted } from './email'
import { deleteUserAccount } from './identity'
import { reportError } from './sentry'
import { auditLog, pendingInvites, userNotificationPrefs, workspaceMembers, workspaces } from '../../src/lib/db/schema'

// Data rights (roadmap 4.2): deleting a workspace, restoring it, erasing it for good, and deleting an account.
//
// Deleting a workspace is a SOFT delete (owner-decided): the row is marked, every route stops seeing it at once
// (auth.ts, share links), the subscription is cancelled and members are emailed. The owner can restore it for
// RESTORE_DAYS days; a daily job (api/cron/purge-deleted.ts) then erases it, and the database cascades remove
// every chart, role, job description, member, invite, template, plan and audit row that belonged to it.

export const RESTORE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export const eraseDate = (deletedAt: Date) => new Date(deletedAt.getTime() + RESTORE_DAYS * DAY_MS)

/** Cancels the subscription now (no refund, no further charges). A missing key or subscription is a no-op; throws if Stripe fails. */
async function cancelSubscription(subscriptionId: string | null): Promise<boolean> {
  if (!subscriptionId || !process.env.STRIPE_SECRET_KEY) return false
  try {
    await new Stripe(process.env.STRIPE_SECRET_KEY).subscriptions.cancel(subscriptionId)
  } catch (err) {
    // Already cancelled in Stripe: that is the state we want.
    if ((err as { code?: string }).code === 'resource_missing') return true
    throw err
  }
  return true
}

export interface DeletableWorkspace {
  id: string
  name: string
  stripeSubscriptionId: string | null
}

/**
 * Soft-deletes a workspace on behalf of its owner. Stripe is cancelled FIRST: if that fails this throws and
 * nothing else changes, so a workspace is never left deleted but still being billed. Returns false when it was
 * already deleted.
 */
export async function softDeleteWorkspace(ws: DeletableWorkspace, actorUserId: string): Promise<boolean> {
  const members = await db.select({ email: workspaceMembers.email, userId: workspaceMembers.userId })
    .from(workspaceMembers).where(eq(workspaceMembers.workspaceId, ws.id))

  const cancelled = await cancelSubscription(ws.stripeSubscriptionId)

  const deletedAt = new Date()
  const [marked] = await db.update(workspaces)
    .set({
      deletedAt, deletedBy: actorUserId, updatedAt: deletedAt,
      // A restored workspace starts on Free; the subscription is gone either way.
      planTier: 'free', planExpiresAt: null, cancelAtPeriodEnd: false,
      ...(cancelled ? { stripeSubscriptionId: null, subscriptionStatus: 'canceled' } : {}),
    })
    .where(and(eq(workspaces.id, ws.id), isNull(workspaces.deletedAt)))
    .returning({ id: workspaces.id })
  if (!marked) return false

  // Nobody can accept an invite into a deleted workspace; restoring does not bring old invites back.
  await db.delete(pendingInvites).where(eq(pendingInvites.workspaceId, ws.id))

  await logAudit({
    workspaceId: ws.id, actorUserId, action: 'workspace.deleted', targetType: 'workspace', targetId: ws.id,
    details: { eraseOn: eraseDate(deletedAt).toISOString().slice(0, 10) },
  })

  // Best-effort: a failed email never undoes the deletion.
  const erase = eraseDate(deletedAt)
  await Promise.allSettled(members.filter(m => m.email).map(m =>
    sendWorkspaceDeleted({ to: m.email, workspaceName: ws.name, eraseOn: erase, isOwner: m.userId === actorUserId })))
  return true
}

export type RestoreResult = { ok: true } | { ok: false; error: 'not-found' | 'expired' | 'owns-another-workspace' }

/** Brings a soft-deleted workspace back. Only its owner, only inside the window, and never if that would give them a second workspace. */
export async function restoreWorkspace(workspaceId: string, userId: string, now = new Date()): Promise<RestoreResult> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
  if (!ws || !ws.deletedAt || ws.ownerId !== userId) return { ok: false, error: 'not-found' }
  if (eraseDate(ws.deletedAt) <= now) return { ok: false, error: 'expired' }

  // One owned workspace per user (owner-decided in roadmap 1.2).
  const [other] = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(eq(workspaces.ownerId, userId), isNull(workspaces.deletedAt))).limit(1)
  if (other) return { ok: false, error: 'owns-another-workspace' }

  await db.update(workspaces).set({ deletedAt: null, deletedBy: null, updatedAt: now }).where(eq(workspaces.id, workspaceId))
  await logAudit({ workspaceId, actorUserId: userId, action: 'workspace.restored', targetType: 'workspace', targetId: workspaceId })
  return { ok: true }
}

/** Erases every workspace that has been deleted for longer than the restore window. Returns how many. */
export async function purgeExpiredWorkspaces(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RESTORE_DAYS * DAY_MS)
  const expired = await db.select({ id: workspaces.id }).from(workspaces).where(lt(workspaces.deletedAt, cutoff))
  if (expired.length === 0) return 0
  // Foreign keys cascade: charts, roles, lines, JDs, templates, plans, members, invites, usage and audit rows go too.
  await db.delete(workspaces).where(inArray(workspaces.id, expired.map(w => w.id)))
  return expired.length
}

export interface AccountDeletion { workspacesDeleted: number; membershipsRemoved: number }

/**
 * Deletes a person (roadmap 4.2). Owner-decided: a workspace they own is deleted with them (soft delete, members told);
 * their memberships elsewhere are removed; their email is scrubbed from other workspaces' audit logs; then their sign-in
 * account is deleted. The sign-in account goes LAST and every step before it is safe to repeat, so a failure in the
 * middle is fixed by trying again. Note the owner can no longer sign in, so a workspace deleted this way cannot be
 * restored by them and is erased after the restore window.
 */
export async function deleteAccount(userId: string): Promise<AccountDeletion> {
  const memberships = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId))
  const emails = [...new Set(memberships.map(m => m.email.toLowerCase()).filter(Boolean))]

  const owned = await db.select().from(workspaces).where(and(eq(workspaces.ownerId, userId), isNull(workspaces.deletedAt)))
  let workspacesDeleted = 0
  for (const ws of owned) {
    if (await softDeleteWorkspace(ws, userId)) workspacesDeleted++
  }
  const ownedIds = new Set(owned.map(w => w.id))

  // Leaving workspaces that live on: say so in their audit log (no personal data), then drop the member row.
  const leaving = memberships.filter(m => !ownedIds.has(m.workspaceId))
  for (const m of leaving) {
    await logAudit({ workspaceId: m.workspaceId, actorUserId: userId, action: 'member.left', targetType: 'member', targetId: userId, details: { role: m.permission } })
  }
  await db.delete(workspaceMembers).where(eq(workspaceMembers.userId, userId))

  if (emails.length > 0) {
    await db.delete(pendingInvites).where(inArray(sql`lower(${pendingInvites.email})`, emails))
    // Their email must not survive in anyone's activity log: events about them, and invites that named them.
    await db.update(auditLog)
      .set({ details: sql`${auditLog.details} - 'email'` })
      .where(sql`lower(${auditLog.details} ->> 'email') in (${sql.join(emails.map(e => sql`${e}`), sql`, `)})`)
  }
  await db.update(pendingInvites).set({ invitedBy: null }).where(eq(pendingInvites.invitedBy, userId))
  await db.update(auditLog).set({ details: sql`${auditLog.details} - 'email'` })
    .where(and(eq(auditLog.targetType, 'member'), eq(auditLog.targetId, userId)))

  // The person's own email settings go with them. (Comments they wrote stay with the workspace like other content,
  // under an opaque id; the UI shows "A former member".)
  await db.delete(userNotificationPrefs).where(eq(userNotificationPrefs.userId, userId))

  try {
    await deleteUserAccount(userId)
  } catch (err) {
    reportError(err, { route: 'account.delete', userId })
    throw err
  }
  return { workspacesDeleted, membershipsRemoved: memberships.length }
}
