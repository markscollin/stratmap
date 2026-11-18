// R-50: the chart limit holds when creates arrive together. Over the limit every chart in the workspace goes view-only
// (requireChartsEditable), so a double click at the edge must not be able to push a Free workspace to 2 charts.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and, count } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import chartsHandler from '../charts/index'
import duplicateHandler from '../charts/[id]/duplicate'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, testDb, TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}
const realCharts = async () => (await testDb.select({ n: count() }).from(schema.charts)
  .where(and(eq(schema.charts.workspaceId, TEST_WS_ID), eq(schema.charts.isSample, false))))[0].n
const create = (name: string) => call(chartsHandler, { method: 'POST', body: { name } })
const duplicate = () => call(duplicateHandler, { method: 'POST', query: { id: TEST_CHART_ID } })

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace() // Free: one chart
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('chart limit under parallel requests (R-50)', () => {
  it('parallel creates at the limit leave at most one chart, and every refusal is a 402', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => create(`Racer ${i}`)))
    expect(await realCharts()).toBeLessThanOrEqual(1)
    expect(results.filter(r => r._status === 201).length).toBeLessThanOrEqual(1)
    for (const r of results.filter(r => r._status !== 201)) {
      expect(r._status).toBe(402)
      expect(r._body).toMatchObject({ error: 'plan-limit', limit: 'charts' })
    }
  })

  it('the workspace is still editable afterwards (not frozen by the race)', async () => {
    await Promise.all(Array.from({ length: 4 }, (_, i) => create(`Racer ${i}`)))
    const { getChartUsage } = await import('../_lib/access')
    expect((await getChartUsage(TEST_WS_ID))?.frozen).toBe(false)
  })

  it('a single create with room still works, and a refused one leaves nothing behind', async () => {
    expect((await create('First'))._status).toBe(201)
    const second = await create('Second')
    expect(second._status).toBe(402)
    expect(await realCharts()).toBe(1)
    const rows = await testDb.select().from(schema.charts).where(eq(schema.charts.name, 'Second'))
    expect(rows).toHaveLength(0)
  })

  it('parallel duplicates cannot take a Free workspace past its one chart; the refused copy leaves no roles behind', async () => {
    await seedChart()
    await seedNode()
    // The source is a sample, which does not count, so there is room for exactly one real chart.
    await testDb.update(schema.charts).set({ isSample: true }).where(eq(schema.charts.id, TEST_CHART_ID))
    const results = await Promise.all(Array.from({ length: 4 }, () => duplicate()))
    expect(await realCharts()).toBeLessThanOrEqual(1)
    expect(results.filter(r => r._status === 201).length).toBeLessThanOrEqual(1)
    for (const r of results.filter(r => r._status !== 201)) expect(r._body).toMatchObject({ error: 'plan-limit', limit: 'charts' })
    const strayRoles = await testDb.select({ n: count() }).from(schema.nodes)
    expect(strayRoles[0].n).toBe(1 + (await realCharts()))
  })

  it('a sample chart is never refused by the recount', async () => {
    const res = await call(chartsHandler, { method: 'POST', body: { name: 'Sample', isSample: true } })
    expect(res._status).toBe(201)
  })
})
