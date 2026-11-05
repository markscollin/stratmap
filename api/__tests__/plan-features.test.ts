// Paid features locked on Free (src/lib/plans.ts PAID_FEATURES): job description
// editing and the approval workflow are enforced by the API, not just the UI.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import jdHandler from '../charts/[id]/jd/[nodeId]'
import chartHandler from '../charts/[id]'
import chartsHandler from '../charts/index'
import headcountHandler from '../headcount'
import headcountItemHandler from '../headcount/[id]'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, seedMember, testDb, TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}
const jdQuery = { id: TEST_CHART_ID, nodeId: TEST_NODE_ID }
const setTier = (planTier: 'free' | 'starter' | 'growth') => testDb.update(schema.workspaces).set({ planTier })

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace() // free
  await seedChart()
  await seedNode()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('Free plan: job descriptions', () => {
  it('writing a JD → 402 plan-feature naming what upgrading unlocks', async () => {
    const res = await call(jdHandler, { method: 'PUT', query: jdQuery, body: { responsibilities: 'x' } })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ error: 'plan-feature', feature: 'jd-editor', requiredTier: 'starter', tier: 'free' })
    expect((res._body as { message: string }).message).toMatch(/Starter/)
    expect(await testDb.select().from(schema.jobDescriptions)).toHaveLength(0)
  })

  it('reading JDs still works (e.g. after a downgrade)', async () => {
    await testDb.insert(schema.jobDescriptions).values({ id: 'jd-1', nodeId: TEST_NODE_ID, chartId: TEST_CHART_ID, updatedBy: 'u', responsibilities: 'kept' })
    const res = await call(jdHandler, { method: 'GET', query: jdQuery })
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ responsibilities: 'kept' })
  })

  it('role checks still come first: a viewer gets 403, not an upsell', async () => {
    await seedMember('u-v', 'viewer')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-v', workspaceId: TEST_WS_ID })
    expect((await call(jdHandler, { method: 'PUT', query: jdQuery, body: { responsibilities: 'x' } }))._status).toBe(403)
  })

  it('an active trial unlocks it', async () => {
    await testDb.update(schema.workspaces).set({ trialPlan: 'starter', trialEndsAt: new Date(Date.now() + 86_400_000) })
    expect((await call(jdHandler, { method: 'PUT', query: jdQuery, body: { responsibilities: 'x' } }))._status).toBe(201)
  })
})

describe('Free plan: approval workflow', () => {
  for (const status of ['review', 'approved', 'rejected', 'live']) {
    it(`moving a chart to "${status}" → 402`, async () => {
      const res = await call(chartHandler, { method: 'PUT', query: { id: TEST_CHART_ID }, body: { status } })
      expect(res._status).toBe(402)
      expect(res._body).toMatchObject({ error: 'plan-feature', feature: 'approval-workflow' })
    })
  }

  it('draft, editing and archive stay free; renaming is unaffected', async () => {
    for (const status of ['editing', 'draft', 'archived']) {
      expect((await call(chartHandler, { method: 'PUT', query: { id: TEST_CHART_ID }, body: { status } }))._status).toBe(200)
    }
    expect((await call(chartHandler, { method: 'PUT', query: { id: TEST_CHART_ID }, body: { name: 'Renamed' } }))._status).toBe(200)
  })

  it('a chart already in review after a downgrade can be saved without re-sending its status', async () => {
    await testDb.update(schema.charts).set({ status: 'review' }).where(eq(schema.charts.id, TEST_CHART_ID))
    expect((await call(chartHandler, { method: 'PUT', query: { id: TEST_CHART_ID }, body: { name: 'x', status: 'review' } }))._status).toBe(200)
  })

  it('cannot create a chart that starts in an approval status', async () => {
    await testDb.delete(schema.charts) // free allows one chart
    const res = await call(chartsHandler, { method: 'POST', body: { name: 'Sneaky', status: 'live' } })
    expect(res._status).toBe(402)
  })

  it('Starter can submit a JD for review', async () => {
    await setTier('starter')
    expect((await call(jdHandler, { method: 'PUT', query: jdQuery, body: { status: 'in-review' } }))._status).toBe(201)
  })
})

describe('Starter unlocks both', () => {
  it('JD writes and chart approvals succeed', async () => {
    await setTier('starter')
    expect((await call(jdHandler, { method: 'PUT', query: jdQuery, body: { responsibilities: 'x' } }))._status).toBe(201)
    expect((await call(chartHandler, { method: 'PUT', query: { id: TEST_CHART_ID }, body: { status: 'review' } }))._status).toBe(200)
  })
})

describe('Headcount planning needs Growth', () => {
  const hire = { title: 'Engineer', targetQuarter: '2026-Q3' }

  for (const tier of ['free', 'starter'] as const) {
    it(`${tier}: adding a hire → 402 naming Growth`, async () => {
      await setTier(tier)
      const res = await call(headcountHandler, { method: 'POST', body: hire })
      expect(res._status).toBe(402)
      expect(res._body).toMatchObject({ error: 'plan-feature', feature: 'headcount-planning', requiredTier: 'growth' })
    })
  }

  it('starter: editing or deleting an existing plan → 402, but listing still works', async () => {
    await setTier('starter')
    await testDb.insert(schema.headcountPlans).values({ id: 'hp-1', workspaceId: TEST_WS_ID, title: 'Kept', targetQuarter: '2026-Q3', createdBy: TEST_USER_ID })
    expect((await call(headcountItemHandler, { method: 'PUT', query: { id: 'hp-1' }, body: { title: 'x' } }))._status).toBe(402)
    expect((await call(headcountItemHandler, { method: 'DELETE', query: { id: 'hp-1' } }))._status).toBe(402)
    const list = await call(headcountHandler, { method: 'GET' })
    expect(list._status).toBe(200)
    expect(JSON.stringify(list._body)).toContain('Kept')
  })

  it('growth: allowed', async () => {
    await setTier('growth')
    expect((await call(headcountHandler, { method: 'POST', body: hire }))._status).toBe(201)
  })
})

