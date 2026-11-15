/// <reference types="node" />
import { and, eq, gt, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm'
import { db } from './db'
import { reportError } from './sentry'
import { sendTrialEnding } from './email'
import { getAppUrl } from './url'
import { PLAN_LIMITS } from '../../src/lib/plans'
import { workspaces, workspaceMembers } from '../../src/lib/db/schema'

// R-40: the trial banner only reaches people who open the app. Owners and admins also get one email three days before the
// trial ends and one when it has ended, each once per trial (`trial_warned_at`, `trial_ended_notice_at`; granting a new
// trial clears them). Workspaces that pay are skipped.

export const TRIAL_WARNING_DAYS = 3
/** A trial that ended longer ago than this gets no "ended" email (the job was off, or the trial is old news). */
export const TRIAL_ENDED_MAX_AGE_DAYS = 7
const DAY = 86_400_000

const NAME: Record<string, string> = { starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' }

export interface TrialNoticeResult { warned: number; ended: number }

export async function sendTrialNotices(now = new Date()): Promise<TrialNoticeResult> {
  const out: TrialNoticeResult = { warned: 0, ended: 0 }
  const live = and(isNotNull(workspaces.trialPlan), isNotNull(workspaces.trialEndsAt), isNull(workspaces.deletedAt), eq(workspaces.planTier, 'free'))

  const soon = await db.select().from(workspaces).where(and(
    live, isNull(workspaces.trialWarnedAt),
    gt(workspaces.trialEndsAt, now), lte(workspaces.trialEndsAt, new Date(now.getTime() + TRIAL_WARNING_DAYS * DAY)),
  ))
  for (const ws of soon) if (await notify(ws, false)) { out.warned++; await db.update(workspaces).set({ trialWarnedAt: now }).where(eq(workspaces.id, ws.id)) }

  const over = await db.select().from(workspaces).where(and(
    live, isNull(workspaces.trialEndedNoticeAt),
    lte(workspaces.trialEndsAt, now), gte(workspaces.trialEndsAt, new Date(now.getTime() - TRIAL_ENDED_MAX_AGE_DAYS * DAY)),
  ))
  for (const ws of over) if (await notify(ws, true)) {
    out.ended++
    // The "ending soon" email is moot once the trial is over.
    await db.update(workspaces).set({ trialEndedNoticeAt: now, trialWarnedAt: ws.trialWarnedAt ?? now }).where(eq(workspaces.id, ws.id))
  }
  return out
}

/** Emails the owners and admins. True when at least one address was tried, so the notice is not repeated tomorrow. */
async function notify(ws: typeof workspaces.$inferSelect, ended: boolean): Promise<boolean> {
  if (!ws.trialEndsAt) return false
  const people = await db.select({ email: workspaceMembers.email }).from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, ws.id), inArray(workspaceMembers.permission, ['owner', 'admin'])))
  const free = PLAN_LIMITS.free
  let tried = 0
  for (const { email } of people) {
    if (!email) continue
    tried++
    try {
      await sendTrialEnding({
        to: email, workspaceName: ws.name, planName: NAME[ws.trialPlan ?? ''] ?? 'paid', endsOn: ws.trialEndsAt, ended,
        limits: { charts: free.maxCharts, rolesPerChart: free.maxNodesPerChart, members: free.seats },
        pricingUrl: `${getAppUrl()}/pricing`,
      })
    } catch (err) {
      reportError(err, { route: 'cron/daily-maintenance', step: 'trial-notice', workspaceId: ws.id })
    }
  }
  return tried > 0
}
