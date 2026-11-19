import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from './db'
import { reportError } from './sentry'
import { captureChart, saveSnapshot } from './snapshots'
import { resolvePlanTier } from './billing'
import { tierHasFeature } from '../../src/lib/plans'
import { charts, chartSnapshots, workspaces } from '../../src/lib/db/schema'

// Daily versions (version history, Growth and above): once a day the daily maintenance job saves a version of every chart that
// has changed since its latest version, so a bad edit or an import can be rolled back without anyone having remembered to save.
// Defaults chosen by the builder, not the owner: daily, newest MAX_SCHEDULED_SNAPSHOTS kept (api/_lib/snapshots.ts), skipped when
// nothing changed. The sample chart and workspaces without the feature are left alone. A version holds roles, lines and
// departments only (see snapshots.ts), never job descriptions or comments.

/** At most this many charts are looked at per run, so one run cannot time out. The start rotates daily, so every chart is reached. */
export const SCHEDULED_CHARTS_PER_RUN = 200
/** A chart that already got a daily version more recently than this is skipped (a repeated or retried run adds nothing). */
const MIN_GAP_MS = 20 * 3_600_000
const DAY = 86_400_000
/** The author recorded on a daily version; it is not a member, and the app shows it as "Automatic". */
export const SYSTEM_USER = 'system'

export interface ScheduledSnapshotResult {
  saved: number
  unchanged: number
  /** Charts not reached today because of the per-run cap (they come round on a later day). */
  deferred: number
  failed: number
}

/** The same JSON text whatever order the keys came in (a stored jsonb value does not keep key order). */
function canonical(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v as object).sort().map(k => [k, walk((v as Record<string, unknown>)[k])]))
    return v
  }
  return JSON.stringify(walk(JSON.parse(JSON.stringify(value))))
}

export async function takeScheduledSnapshots(now = new Date(), maxCharts = SCHEDULED_CHARTS_PER_RUN): Promise<ScheduledSnapshotResult> {
  const out: ScheduledSnapshotResult = { saved: 0, unchanged: 0, deferred: 0, failed: 0 }

  const rows = await db.select({
    id: charts.id, workspaceId: charts.workspaceId, name: charts.name,
    planTier: workspaces.planTier, trialPlan: workspaces.trialPlan, trialEndsAt: workspaces.trialEndsAt,
    cancelAtPeriodEnd: workspaces.cancelAtPeriodEnd, planExpiresAt: workspaces.planExpiresAt,
  }).from(charts).innerJoin(workspaces, eq(charts.workspaceId, workspaces.id))
    .where(and(eq(charts.isSample, false), isNull(workspaces.deletedAt)))
  const eligible = rows.filter(r => tierHasFeature(resolvePlanTier(r), 'version-history')).sort((a, b) => (a.id < b.id ? -1 : 1))
  if (eligible.length === 0) return out

  const start = (Math.floor(now.getTime() / DAY) * maxCharts) % eligible.length
  const todays = Array.from({ length: Math.min(maxCharts, eligible.length) }, (_, i) => eligible[(start + i) % eligible.length])
  out.deferred = eligible.length - todays.length

  for (const chart of todays) {
    try {
      const [latest] = await db.select({ kind: chartSnapshots.kind, createdAt: chartSnapshots.createdAt, data: chartSnapshots.data })
        .from(chartSnapshots).where(eq(chartSnapshots.chartId, chart.id)).orderBy(desc(chartSnapshots.createdAt), desc(chartSnapshots.id)).limit(1)
      if (latest && latest.kind === 'scheduled' && now.getTime() - latest.createdAt.getTime() < MIN_GAP_MS) { out.unchanged++; continue }

      const data = await captureChart(chart.id)
      const nothingNew = data.nodes.length === 0 || (latest && canonical(latest.data) === canonical(data))
      if (nothingNew) { out.unchanged++; continue }

      const day = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      await saveSnapshot({ workspaceId: chart.workspaceId, chartId: chart.id, name: `Daily version, ${day}`, kind: 'scheduled', userId: SYSTEM_USER })
      out.saved++
    } catch (err) {
      out.failed++
      console.error('[scheduled-snapshots]', chart.id, err)
      reportError(err, { route: '/api/cron/daily-maintenance', step: 'scheduled-snapshots' })
    }
  }
  return out
}
