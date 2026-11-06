// Headcount cost modelling (roadmap 5): salary ranges on headcount plans are owner/admin only. Other roles never
// receive them, cannot set them, and the audit log records that a range changed but never the amounts.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import listHandler from '../headcount'
import itemHandler from '../headcount/[id]'
import exportHandler from '../workspace/export'
import {
  setupSchema, cleanDb, seedWorkspace, seedMember, seedHeadcountPlan, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_PLAN_ID,
} from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}
const as = (userId: string) => vi.mocked(requireAuth).mockResolvedValue({ userId, workspaceId: TEST_WS_ID })
const SALARY_KEYS = ['salaryMin', 'salaryMax', 'salaryCurrency']
const base = { title: 'Data Engineer', targetQuarter: '2026-Q2' }
const plans = async () => testDb.select().from(schema.headcountPlans)
const audit = async () => testDb.select().from(schema.auditLog)

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()                                                  // u-test owns it
  await testDb.update(schema.workspaces).set({ planTier: 'growth' })
  await seedMember('u-ad', 'admin')
  await seedMember('u-ed', 'editor')
  await seedMember('u-vi', 'viewer')
  as(TEST_USER_ID)
})

describe('who can see salary ranges', () => {
  beforeEach(async () => {
    await seedHeadcountPlan()
    await testDb.update(schema.headcountPlans).set({ salaryMin: 100_000, salaryMax: 140_000, salaryCurrency: 'USD' }).where(eq(schema.headcountPlans.id, TEST_PLAN_ID))
  })

  it('owners and admins get them', async () => {
    for (const user of [TEST_USER_ID, 'u-ad']) {
      as(user)
      const [plan] = (await call(listHandler, { method: 'GET' }))._body as Record<string, unknown>[]
      expect(plan, user).toMatchObject({ salaryMin: 100_000, salaryMax: 140_000, salaryCurrency: 'USD' })
    }
  })

  it('editors and viewers never receive the fields at all (not even null)', async () => {
    for (const user of ['u-ed', 'u-vi']) {
      as(user)
      const res = await call(listHandler, { method: 'GET' })
      const [plan] = res._body as Record<string, unknown>[]
      expect(plan.title).toBe('Senior Engineer')
      for (const k of SALARY_KEYS) expect(plan, `${user} ${k}`).not.toHaveProperty(k)
      expect(JSON.stringify(res._body)).not.toMatch(/100000|140000/)
    }
  })

  it('the workspace export (owner/admin only) carries them', async () => {
    const res = await call(exportHandler, { method: 'GET' })
    expect(JSON.parse(res._written).headcountPlans[0]).toMatchObject({ salaryMin: 100_000, salaryMax: 140_000, salaryCurrency: 'USD' })
  })
})

describe('who can set them', () => {
  it('an admin can create a plan with a range; the currency is upper-cased', async () => {
    as('u-ad')
    const res = await call(listHandler, { method: 'POST', body: { ...base, salaryMin: 90_000, salaryMax: 120_000, salaryCurrency: 'gbp' } })
    expect(res._status).toBe(201)
    expect(res._body).toMatchObject({ salaryMin: 90_000, salaryMax: 120_000, salaryCurrency: 'GBP' })
  })

  it('an editor can create a plan without a salary, and gets no salary fields back', async () => {
    as('u-ed')
    const res = await call(listHandler, { method: 'POST', body: base })
    expect(res._status).toBe(201)
    for (const k of SALARY_KEYS) expect(res._body).not.toHaveProperty(k)
    expect(await plans()).toHaveLength(1)
  })

  it('an editor who sends a salary is refused and nothing is saved', async () => {
    as('u-ed')
    const res = await call(listHandler, { method: 'POST', body: { ...base, salaryMin: 1, salaryMax: 2, salaryCurrency: 'USD' } })
    expect(res._status).toBe(403)
    expect(res._body).toMatchObject({ error: 'forbidden', required: 'admin' })
    expect(await plans()).toHaveLength(0)
  })

  it('an editor can edit the plan but not its salary, and the reply hides it', async () => {
    await seedHeadcountPlan()
    await testDb.update(schema.headcountPlans).set({ salaryMin: 100_000, salaryMax: 140_000, salaryCurrency: 'USD' })
    as('u-ed')
    const ok = await call(itemHandler, { method: 'PUT', query: { id: TEST_PLAN_ID }, body: { title: 'Renamed' } })
    expect(ok._status).toBe(200)
    for (const k of SALARY_KEYS) expect(ok._body).not.toHaveProperty(k)
    const refused = await call(itemHandler, { method: 'PUT', query: { id: TEST_PLAN_ID }, body: { salaryMax: 999_999 } })
    expect(refused._status).toBe(403)
    expect((await plans())[0]).toMatchObject({ title: 'Renamed', salaryMin: 100_000, salaryMax: 140_000 })
  })

  it('an editor cannot clear a salary either', async () => {
    await seedHeadcountPlan()
    await testDb.update(schema.headcountPlans).set({ salaryMin: 100_000 })
    as('u-ed')
    expect((await call(itemHandler, { method: 'PUT', query: { id: TEST_PLAN_ID }, body: { salaryMin: null } }))._status).toBe(403)
    expect((await plans())[0].salaryMin).toBe(100_000)
  })

  it('an admin can change and clear a range', async () => {
    await seedHeadcountPlan()
    as('u-ad')
    const set = await call(itemHandler, { method: 'PUT', query: { id: TEST_PLAN_ID }, body: { salaryMin: 80_000, salaryMax: 100_000, salaryCurrency: 'eur' } })
    expect(set._body).toMatchObject({ salaryMin: 80_000, salaryMax: 100_000, salaryCurrency: 'EUR' })
    const cleared = await call(itemHandler, { method: 'PUT', query: { id: TEST_PLAN_ID }, body: { salaryMin: null, salaryMax: null, salaryCurrency: null } })
    expect(cleared._body).toMatchObject({ salaryMin: null, salaryMax: null, salaryCurrency: null })
  })
})

describe('validation', () => {
  it.each([
    ['a minimum above the maximum', { salaryMin: 200, salaryMax: 100, salaryCurrency: 'USD' }],
    ['a negative salary', { salaryMin: -1, salaryCurrency: 'USD' }],
    ['a fractional salary', { salaryMin: 1.5, salaryCurrency: 'USD' }],
    ['an absurd salary', { salaryMax: 1_000_000_000, salaryCurrency: 'USD' }],
    ['a currency that is not 3 letters', { salaryMin: 1, salaryCurrency: 'DOLLARS' }],
    ['a salary as text', { salaryMin: '100000', salaryCurrency: 'USD' }],
  ])('rejects %s', async (_name, salary) => {
    as('u-ad')
    const res = await call(listHandler, { method: 'POST', body: { ...base, ...salary } })
    expect(res._status).toBe(400)
    expect(await plans()).toHaveLength(0)
  })

  it('rejects an update that leaves the stored minimum above a newly sent maximum', async () => {
    await seedHeadcountPlan()
    await testDb.update(schema.headcountPlans).set({ salaryMin: 100_000, salaryMax: 140_000, salaryCurrency: 'USD' })
    as('u-ad')
    const res = await call(itemHandler, { method: 'PUT', query: { id: TEST_PLAN_ID }, body: { salaryMax: 50_000 } })
    expect(res._status).toBe(400)
    expect((await plans())[0].salaryMax).toBe(140_000)
  })
})

describe('audit', () => {
  it('records that a range was set or changed, and never the amounts', async () => {
    as('u-ad')
    const created = await call(listHandler, { method: 'POST', body: { ...base, salaryMin: 123_456, salaryMax: 234_567, salaryCurrency: 'USD' } })
    const id = (created._body as { id: string }).id
    await call(itemHandler, { method: 'PUT', query: { id }, body: { salaryMax: 345_678 } })

    const events = (await audit()).filter(e => e.action === 'headcount.salary_updated')
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ targetType: 'headcount', targetId: id, details: { planTitle: 'Data Engineer', changed: 'salaryMin,salaryMax,salaryCurrency' } })
    expect(events[1].details).toMatchObject({ changed: 'salaryMax' })
    const all = JSON.stringify(await audit())
    for (const amount of ['123456', '234567', '345678']) expect(all).not.toContain(amount)
  })

  it('logs nothing for a plan without a salary, an unchanged range, or an edit that leaves the salary alone', async () => {
    as('u-ad')
    const created = await call(listHandler, { method: 'POST', body: base })
    const id = (created._body as { id: string }).id
    await call(itemHandler, { method: 'PUT', query: { id }, body: { salaryMin: 100, salaryMax: 200, salaryCurrency: 'USD' } })
    const before = (await audit()).length
    await call(itemHandler, { method: 'PUT', query: { id }, body: { salaryMin: 100, salaryMax: 200, salaryCurrency: 'USD' } })
    await call(itemHandler, { method: 'PUT', query: { id }, body: { title: 'Other' } })
    expect(await audit()).toHaveLength(before)
    expect((await audit()).filter(e => e.action === 'headcount.salary_updated')).toHaveLength(1)
  })
})
