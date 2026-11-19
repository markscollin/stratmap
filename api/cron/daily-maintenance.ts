import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { cronAuthorised } from '../_lib/cron'
import { reportError } from '../_lib/sentry'
import { pruneRateLimits } from '../_lib/rateLimit'
import { reconcileSubscriptions, type ReconcileResult } from '../_lib/reconcile'
import { sendTrialNotices, type TrialNoticeResult } from '../_lib/trialNotices'
import { takeScheduledSnapshots, type ScheduledSnapshotResult } from '../_lib/scheduledSnapshots'

// Daily job (vercel.json "crons"), same CRON_SECRET rule as purge-deleted. Four independent steps; one failing never stops the others:
//   - R-22 re-read every workspace's Stripe subscription, so a lost webhook is repaired within a day
//   - R-27 delete rate-limit rows whose window is long over
//   - R-40 trial-ending emails
//   - a daily version of every changed chart on plans with version history
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.CRON_SECRET) return res.status(503).json({ error: 'not-configured' })
  if (!cronAuthorised(req)) return res.status(401).json({ error: 'Unauthorized' })

  const report: {
    reconcile: ReconcileResult | 'stripe-not-configured' | 'failed'
    rateLimitsPruned: number | 'failed'
    trialNotices: TrialNoticeResult | 'failed'
    scheduledVersions: ScheduledSnapshotResult | 'failed'
  } = { reconcile: 'failed', rateLimitsPruned: 'failed', trialNotices: 'failed', scheduledVersions: 'failed' }

  try {
    report.reconcile = process.env.STRIPE_SECRET_KEY
      ? await reconcileSubscriptions(new Stripe(process.env.STRIPE_SECRET_KEY))
      : 'stripe-not-configured'
  } catch (err) { fail('reconcile', err) }
  try { report.rateLimitsPruned = await pruneRateLimits() } catch (err) { fail('prune-rate-limits', err) }
  try { report.trialNotices = await sendTrialNotices() } catch (err) { fail('trial-notices', err) }
  try { report.scheduledVersions = await takeScheduledSnapshots() } catch (err) { fail('scheduled-versions', err) }

  console.log('[daily-maintenance]', JSON.stringify(report))
  const failed = Object.values(report).includes('failed')
  return res.status(failed ? 500 : 200).json(report)
}

function fail(step: string, err: unknown) {
  console.error(`/api/cron/daily-maintenance ${step}`, err)
  reportError(err, { route: '/api/cron/daily-maintenance', step })
}
