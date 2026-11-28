import { and, eq, isNull } from 'drizzle-orm'
import { db } from './db'
import { reportError } from './sentry'
import { getEffectivePlan } from './access'
import { openSecret } from './secretBox'
import { BambooError, BAMBOO_FAILURE_TEXT, bambooSheet, fetchBambooEmployees } from './bamboohr'
import { applyChartUpdate, bodyFromPlan, planUpdateFromSheet } from './chartUpdate'
import { charts, hrIntegrations, workspaces, type HrSyncResult } from '../../src/lib/db/schema'
import { tierHasFeature } from '../../src/lib/plans'
import type { UpdatePlan } from '../../src/lib/updateFromFile'

// R-78: one HR sync, used by "Sync now" in the dialog and by the daily job. It reads BambooHR, works out the update on the
// server with the same rules as "Update from file", and applies it through the same atomic path.
//
// The daily job applies without a person looking, so it has a brake: it holds (changes nothing, says why) when the update
// would remove more than HELD_LEAVERS_MIN people or HELD_LEAVERS_SHARE of the chart, when BambooHR lists nobody, or when the
// data has a problem the importer refuses (a reporting loop, a duplicate id). Someone then reviews it with Preview and applies
// it with Sync now. The thresholds are the builder's defaults, not owner decisions.

export const HELD_LEAVERS_MIN = 5
export const HELD_LEAVERS_SHARE = 0.1

type Integration = typeof hrIntegrations.$inferSelect

export type HrRun =
  | { kind: 'preview'; plan: UpdatePlan }
  | { kind: 'result'; result: HrSyncResult; chartChanged?: boolean; planLimit?: boolean }

/** A short summary of a plan for the browser: labels and counts, never emails, ids or the key. */
export function planSummary(plan: UpdatePlan) {
  return {
    blocked: plan.blocked,
    hasChanges: plan.hasChanges,
    issues: plan.issues.slice(0, 40).map(i => ({ row: i.row, severity: i.severity, message: i.message })),
    joiners: plan.joiners.map(j => ({ label: j.label, manager: j.manager })),
    leavers: plan.leavers.map(l => ({ label: l.label })),
    moves: plan.moves.map(m => ({ label: m.label, from: m.from, to: m.to })),
    edits: plan.edits.map(e => ({ label: e.label, changes: e.changes })),
    unchanged: plan.unchanged,
    kept: plan.kept,
  }
}

function counts(plan: UpdatePlan) {
  return { joiners: plan.joiners.length, leavers: plan.leavers.filter(l => l.removed).length, moves: plan.moves.length, changed: plan.edits.length }
}

/** Why the daily job should not apply this plan on its own, or null when it may. */
export function holdReason(plan: UpdatePlan, currentRoles: number, listed: number): string | null {
  if (listed === 0) return 'BambooHR listed nobody, so nothing was removed. Check the connection and the API key\'s access.'
  if (plan.blocked) return `BambooHR's data has a problem: ${plan.issues.find(i => i.severity === 'error')?.message ?? 'see Preview.'}`
  const leaving = plan.leavers.filter(l => l.removed).length
  if (leaving > Math.max(HELD_LEAVERS_MIN, Math.floor(currentRoles * HELD_LEAVERS_SHARE))) {
    return `${leaving} people would be removed at once, so the daily sync waited for someone to review it. Open Preview, then Sync now.`
  }
  return null
}

export async function runHrSync(integration: Integration, opts: {
  mode: 'preview' | 'apply'
  trigger: HrSyncResult['trigger']
  actor: string
  /** For a person's Sync now: the revision their canvas last saw. The daily job reads the chart itself, so it passes undefined. */
  expectedRevision?: number
  fetchImpl?: typeof fetch
  now?: Date
}): Promise<HrRun> {
  const now = opts.now ?? new Date()
  const record = async (result: HrSyncResult) => {
    await db.update(hrIntegrations).set({ lastSyncAt: now, lastResult: result }).where(eq(hrIntegrations.id, integration.id))
    return result
  }
  const failed = async (reason: string): Promise<HrRun> => {
    const result: HrSyncResult = { at: now.toISOString(), status: 'failed', reason, trigger: opts.trigger }
    return { kind: 'result', result: opts.mode === 'apply' ? await record(result) : result }
  }

  const apiKey = openSecret(integration.apiKeyEncrypted)
  if (!apiKey) return failed('The stored API key can no longer be read. Disconnect and connect again with the key.')
  const [chart] = await db.select({ id: charts.id, name: charts.name, isSample: charts.isSample }).from(charts)
    .where(eq(charts.id, integration.chartId)).limit(1)
  if (!chart) return failed('The chart no longer exists.')
  const plan = await getEffectivePlan(integration.workspaceId)
  if (!plan) return failed('The workspace no longer exists.')

  let people
  try {
    people = await fetchBambooEmployees(integration.subdomain, apiKey, opts.fetchImpl)
  } catch (err) {
    if (err instanceof BambooError) return failed(BAMBOO_FAILURE_TEXT[err.kind])
    throw err
  }
  const { sheet, mapping } = bambooSheet(people)
  const update = await planUpdateFromSheet(integration.workspaceId, chart.id, sheet, mapping, plan.limits.maxNodesPerChart)
  if (opts.mode === 'preview') return { kind: 'preview', plan: update }

  const currentRoles = update.result.nodes.length - update.joiners.length + update.leavers.filter(l => l.removed).length
  const hold = sheet.rows.length === 0 || update.blocked || opts.trigger === 'scheduled'
    ? holdReason(update, currentRoles, sheet.rows.length)
    : null
  if (hold) {
    const status = opts.trigger === 'scheduled' ? 'held' : 'failed'
    return { kind: 'result', result: await record({ at: now.toISOString(), status, reason: hold, trigger: opts.trigger, ...counts(update) }) }
  }
  if (!update.hasChanges) {
    return { kind: 'result', result: await record({ at: now.toISOString(), status: 'unchanged', trigger: opts.trigger }) }
  }
  const outcome = await applyChartUpdate({
    workspaceId: integration.workspaceId, chart, body: bodyFromPlan(update), maxNodes: plan.limits.maxNodesPerChart,
    expectedRevision: opts.expectedRevision, actor: opts.actor, versionName: 'Before BambooHR sync',
    audit: { action: 'chart.synced_from_hr', extra: { trigger: opts.trigger } },
  })
  if (!outcome.ok) {
    if (outcome.reason === 'chart-changed') {
      // Someone changed the chart meanwhile: nothing was applied, the next sync starts from the new chart.
      return { kind: 'result', chartChanged: true, result: await record({ at: now.toISOString(), status: 'failed', reason: 'The chart changed while syncing. Try again.', trigger: opts.trigger }) }
    }
    const reason = outcome.reason === 'plan-limit'
      ? `BambooHR has more people than the plan allows on one chart (${plan.limits.maxNodesPerChart}). Nothing was changed.`
      : 'A sample chart cannot be synced.'
    return { kind: 'result', planLimit: outcome.reason === 'plan-limit', result: await record({ at: now.toISOString(), status: 'failed', reason, trigger: opts.trigger }) }
  }
  return { kind: 'result', result: await record({ at: now.toISOString(), status: 'ok', trigger: opts.trigger, ...counts(update) }) }
}

export interface ScheduledHrSyncResult { synced: number; held: number; failed: number; unchanged: number; skipped: number; deferred: number }

/**
 * The daily step: every connection with auto-sync on, on a live workspace whose plan still has the feature, oldest synced first,
 * until the cron budget runs out. One connection failing is reported and never stops the rest.
 */
export async function runScheduledHrSyncs(now = new Date(), fetchImpl?: typeof fetch, deadline = Infinity): Promise<ScheduledHrSyncResult> {
  const out: ScheduledHrSyncResult = { synced: 0, held: 0, failed: 0, unchanged: 0, skipped: 0, deferred: 0 }
  const rows = await db.select({ integration: hrIntegrations }).from(hrIntegrations)
    .innerJoin(workspaces, and(eq(workspaces.id, hrIntegrations.workspaceId), isNull(workspaces.deletedAt)))
    .where(eq(hrIntegrations.autoSync, true))
  rows.sort((a, b) => (a.integration.lastSyncAt?.getTime() ?? 0) - (b.integration.lastSyncAt?.getTime() ?? 0))
  for (let i = 0; i < rows.length; i++) {
    if (Date.now() > deadline) { out.deferred = rows.length - i; break }
    const integration = rows[i].integration
    try {
      const plan = await getEffectivePlan(integration.workspaceId)
      if (!plan || !tierHasFeature(plan.tier, 'hr-sync')) { out.skipped++; continue }
      const run = await runHrSync(integration, { mode: 'apply', trigger: 'scheduled', actor: 'system', fetchImpl, now })
      if (run.kind !== 'result') continue
      const s = run.result.status
      if (s === 'ok') out.synced++
      else if (s === 'held') out.held++
      else if (s === 'unchanged') out.unchanged++
      else out.failed++
    } catch (err) {
      out.failed++
      reportError(err, { route: '/api/cron/daily-maintenance', step: 'hr-sync', integrationId: integration.id })
    }
  }
  return out
}
