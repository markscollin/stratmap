// Daily versions: one per changed chart, only where version history is included, pruned to the newest 14, never duplicated.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
const reported: string[] = []
vi.mock('../_lib/sentry', () => ({ reportError: (e: unknown) => { reported.push(e instanceof Error ? e.message : String(e)) } }))

import { and, eq } from 'drizzle-orm'
import { takeScheduledSnapshots, SYSTEM_USER } from '../_lib/scheduledSnapshots'
import { MAX_SCHEDULED_SNAPSHOTS, saveSnapshot } from '../_lib/snapshots'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, testDb, TEST_WS_ID, TEST_CHART_ID, TEST_USER_ID } from './helpers/db'
import * as schema from '../../src/lib/db/schema'

const DAY = 86_400_000
const T0 = new Date('2026-11-19T03:41:00Z')
const setTier = (tier: 'free' | 'starter' | 'growth') => testDb.update(schema.workspaces).set({ planTier: tier }).where(eq(schema.workspaces.id, TEST_WS_ID))
const versions = (kind?: string) => testDb.select().from(schema.chartSnapshots).where(kind ? and(eq(schema.chartSnapshots.chartId, TEST_CHART_ID), eq(schema.chartSnapshots.kind, kind)) : eq(schema.chartSnapshots.chartId, TEST_CHART_ID))

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb(); reported.length = 0
  await seedWorkspace(); await seedChart(); await seedNode()
  await setTier('growth')
})

describe('takeScheduledSnapshots', () => {
  it('saves a daily version of a changed chart on a plan with version history, as the system', async () => {
    const r = await takeScheduledSnapshots(T0)
    expect(r).toEqual({ saved: 1, unchanged: 0, deferred: 0, failed: 0 })
    const [v] = await versions('scheduled')
    expect(v.name).toBe('Daily version, 19 Nov 2026')
    expect(v.createdBy).toBe(SYSTEM_USER)
    expect(v.nodeCount).toBe(1)
  })

  it('does nothing without the feature (Free, Starter), for a deleted workspace, a sample chart or an empty chart', async () => {
    for (const tier of ['free', 'starter'] as const) {
      await setTier(tier)
      expect((await takeScheduledSnapshots(T0)).saved).toBe(0)
    }
    await setTier('growth')
    await testDb.update(schema.workspaces).set({ deletedAt: new Date(), deletedBy: TEST_USER_ID }).where(eq(schema.workspaces.id, TEST_WS_ID))
    expect((await takeScheduledSnapshots(T0)).saved).toBe(0)
    await testDb.update(schema.workspaces).set({ deletedAt: null, deletedBy: null }).where(eq(schema.workspaces.id, TEST_WS_ID))
    await testDb.update(schema.charts).set({ isSample: true }).where(eq(schema.charts.id, TEST_CHART_ID))
    expect((await takeScheduledSnapshots(T0)).saved).toBe(0)
    await testDb.update(schema.charts).set({ isSample: false }).where(eq(schema.charts.id, TEST_CHART_ID))
    await testDb.delete(schema.nodes).where(eq(schema.nodes.chartId, TEST_CHART_ID))
    expect((await takeScheduledSnapshots(T0)).saved).toBe(0)
    expect(await versions()).toHaveLength(0)
  })

  it('a trial counts as the plan, and a lapsed trial does not', async () => {
    await setTier('free')
    await testDb.update(schema.workspaces).set({ trialPlan: 'growth', trialEndsAt: new Date(T0.getTime() + DAY) }).where(eq(schema.workspaces.id, TEST_WS_ID))
    expect((await takeScheduledSnapshots(T0)).saved).toBe(1)
    await cleanDb(); await seedWorkspace(); await seedChart(); await seedNode()
    await testDb.update(schema.workspaces).set({ trialPlan: 'growth', trialEndsAt: new Date(T0.getTime() - DAY) }).where(eq(schema.workspaces.id, TEST_WS_ID))
    expect((await takeScheduledSnapshots(T0)).saved).toBe(0)
  })

  it('saves nothing when the chart is the same as its latest version, whoever saved it; saves again once it changes', async () => {
    await saveSnapshot({ workspaceId: TEST_WS_ID, chartId: TEST_CHART_ID, name: 'Mine', kind: 'manual', userId: TEST_USER_ID })
    expect(await takeScheduledSnapshots(T0)).toMatchObject({ saved: 0, unchanged: 1 })

    await testDb.update(schema.nodes).set({ title: 'Chief Technology Officer' }).where(eq(schema.nodes.chartId, TEST_CHART_ID))
    expect(await takeScheduledSnapshots(new Date(T0.getTime() + DAY))).toMatchObject({ saved: 1, unchanged: 0 })
    // and the next day, unchanged again
    expect(await takeScheduledSnapshots(new Date(T0.getTime() + 2 * DAY))).toMatchObject({ saved: 0, unchanged: 1 })
    expect(await versions('scheduled')).toHaveLength(1)
  })

  it('a second run the same day adds nothing, even after a change', async () => {
    await takeScheduledSnapshots(T0)
    await testDb.update(schema.nodes).set({ title: 'Changed' }).where(eq(schema.nodes.chartId, TEST_CHART_ID))
    expect((await takeScheduledSnapshots(new Date(T0.getTime() + 3_600_000))).saved).toBe(0)
    expect(await versions('scheduled')).toHaveLength(1)
  })

  it(`keeps only the newest ${MAX_SCHEDULED_SNAPSHOTS} daily versions, and does not touch manual or "before restore" ones`, async () => {
    await saveSnapshot({ workspaceId: TEST_WS_ID, chartId: TEST_CHART_ID, name: 'Mine', kind: 'manual', userId: TEST_USER_ID })
    await saveSnapshot({ workspaceId: TEST_WS_ID, chartId: TEST_CHART_ID, name: 'Before restoring “x”', kind: 'auto', userId: TEST_USER_ID })
    for (let i = 0; i < MAX_SCHEDULED_SNAPSHOTS + 3; i++) {
      await testDb.update(schema.nodes).set({ title: `Title ${i}` }).where(eq(schema.nodes.chartId, TEST_CHART_ID))
      await takeScheduledSnapshots(new Date(T0.getTime() + i * DAY))
    }
    expect(await versions('scheduled')).toHaveLength(MAX_SCHEDULED_SNAPSHOTS)
    expect(await versions('manual')).toHaveLength(1)
    expect(await versions('auto')).toHaveLength(1)
  })

  it('looks at no more than the per-run cap and says how many wait for another day', async () => {
    for (let i = 0; i < 3; i++) {
      await testDb.insert(schema.charts).values({ id: `chart-x${i}`, workspaceId: TEST_WS_ID, name: `X${i}`, status: 'draft', version: 1, ownerId: TEST_USER_ID, creatorId: TEST_USER_ID })
      await testDb.insert(schema.nodes).values({ id: `node-x${i}`, chartId: `chart-x${i}`, name: 'A', title: 'B', status: 'active', x: 0, y: 0 } as never)
    }
    const r = await takeScheduledSnapshots(T0, 2)
    expect(r.saved).toBe(2)
    expect(r.deferred).toBe(2) // four charts, two looked at
    // the next day starts further round, so the others are reached
    const r2 = await takeScheduledSnapshots(new Date(T0.getTime() + DAY), 2)
    expect(r2.saved + r2.unchanged).toBe(2)
    const all = await testDb.select().from(schema.chartSnapshots).where(eq(schema.chartSnapshots.kind, 'scheduled'))
    expect(new Set(all.map(s => s.chartId)).size).toBeGreaterThanOrEqual(3)
  })

  it('one chart failing does not stop the others, and is reported', async () => {
    await testDb.insert(schema.charts).values({ id: 'chart-y', workspaceId: TEST_WS_ID, name: 'Y', status: 'draft', version: 1, ownerId: TEST_USER_ID, creatorId: TEST_USER_ID })
    await testDb.insert(schema.nodes).values({ id: 'node-y', chartId: 'chart-y', name: 'A', title: 'B', status: 'active', x: 0, y: 0 } as never)
    const snaps = await import('../_lib/snapshots')
    const spy = vi.spyOn(snaps, 'captureChart').mockRejectedValueOnce(new Error('boom'))
    const r = await takeScheduledSnapshots(T0)
    spy.mockRestore()
    expect(r).toMatchObject({ failed: 1, saved: 1 })
    expect(reported).toEqual(['boom'])
  })
})
