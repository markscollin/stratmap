// Roadmap 3.4: moving roles is one bulk UPDATE ... FROM (VALUES ...), scoped to the chart.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import { eq, inArray, sql } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import nodesHandler from '../charts/[id]/nodes'
import { setupSchema, cleanDb, seedWorkspace, seedChart, testDb, TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID } from './helpers/db'
import { chunk } from '../_lib/chunk'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

const q = { id: TEST_CHART_ID }
async function put(body: unknown, query = q) {
  const res = createRes()
  await nodesHandler(createReq({ method: 'PUT', query, body }) as never, res as never)
  return res
}
const row = (id: string, chartId = TEST_CHART_ID, x = 0, y = 0) =>
  ({ id, chartId, name: id, title: 'T', x, y, status: 'active' as const })
async function positionsOf(ids: string[]) {
  const rows = await testDb.select({ id: schema.nodes.id, x: schema.nodes.x, y: schema.nodes.y }).from(schema.nodes).where(inArray(schema.nodes.id, ids))
  return new Map(rows.map(r => [r.id, { x: r.x, y: r.y }]))
}

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  await seedChart()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('bulk position update', () => {
  it('moves every role in the request and leaves the others alone', async () => {
    await testDb.insert(schema.nodes).values(['a', 'b', 'c', 'd'].map(id => row(id, TEST_CHART_ID, 1, 1)))
    const res = await put([{ id: 'a', x: 10, y: 20 }, { id: 'c', x: -30.5, y: 40.25 }])
    expect(res._status).toBe(204)
    const p = await positionsOf(['a', 'b', 'c', 'd'])
    expect(p.get('a')).toEqual({ x: 10, y: 20 })
    expect(p.get('c')).toEqual({ x: -30.5, y: 40.25 })
    expect(p.get('b')).toEqual({ x: 1, y: 1 })
    expect(p.get('d')).toEqual({ x: 1, y: 1 })
  })

  it('moves a thousand roles in one request', async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `n${i}`)
    for (const part of chunk(ids.map(id => row(id)))) await testDb.insert(schema.nodes).values(part)
    const res = await put(ids.map((id, i) => ({ id, x: i * 2, y: -i })))
    expect(res._status).toBe(204)
    const p = await positionsOf(ids)
    expect(p.get('n0')).toEqual({ x: 0, y: 0 })
    expect(p.get('n999')).toEqual({ x: 1998, y: -999 })
    expect([...p.values()].filter(v => v.x === 0 && v.y === 0)).toHaveLength(1) // only n0 is at the origin
  })

  it('handles the largest request the API accepts (5,000 roles)', async () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `m${i}`)
    for (const part of chunk(ids.map(id => row(id)))) await testDb.insert(schema.nodes).values(part)
    const r = await put(ids.map(id => ({ id, x: 7, y: 9 })))
    expect(r._status).toBe(204)
    const [{ moved }] = (await testDb.execute<{ moved: number }>(
      sql`select count(*)::int as moved from nodes where chart_id = ${TEST_CHART_ID} and x = 7 and y = 9`)).rows
    expect(moved).toBe(5000)
  })

  it('never touches roles in another chart, even if their ids are in the request', async () => {
    // Two charts need a plan that allows them (a Free workspace with two would be view-only).
    await testDb.update(schema.workspaces).set({ planTier: 'growth' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    await testDb.insert(schema.charts).values({ id: 'other-chart', workspaceId: TEST_WS_ID, name: 'Other', ownerId: TEST_USER_ID, creatorId: TEST_USER_ID })
    await testDb.insert(schema.nodes).values([row('mine'), row('theirs', 'other-chart', 5, 5)])
    expect((await put([{ id: 'mine', x: 100, y: 100 }, { id: 'theirs', x: 999, y: 999 }]))._status).toBe(204)
    const p = await positionsOf(['mine', 'theirs'])
    expect(p.get('mine')).toEqual({ x: 100, y: 100 })
    expect(p.get('theirs')).toEqual({ x: 5, y: 5 })
  })

  it('ignores ids that do not exist', async () => {
    await testDb.insert(schema.nodes).values([row('real')])
    expect((await put([{ id: 'ghost', x: 1, y: 1 }, { id: 'real', x: 2, y: 3 }]))._status).toBe(204)
    expect((await positionsOf(['real'])).get('real')).toEqual({ x: 2, y: 3 })
  })

  it('an empty list is a no-op, not an error', async () => {
    expect((await put([]))._status).toBe(204)
  })

  it('an id that looks like SQL is refused by validation, and nothing is touched', async () => {
    await testDb.insert(schema.nodes).values([row('safe', TEST_CHART_ID, 1, 1)])
    const res = await put([{ id: "x'); DROP TABLE nodes; --", x: 1, y: 1 }, { id: 'safe', x: 4, y: 4 }])
    expect(res._status).toBe(400)
    expect((await positionsOf(['safe'])).get('safe')).toEqual({ x: 1, y: 1 })
    const [{ n }] = (await testDb.execute<{ n: number }>(sql`select count(*)::int as n from nodes`)).rows
    expect(n).toBe(1)
  })

  it('still validates: non-finite or out-of-range coordinates are refused and nothing moves', async () => {
    await testDb.insert(schema.nodes).values([row('a', TEST_CHART_ID, 1, 1)])
    expect((await put([{ id: 'a', x: 1e12, y: 0 }]))._status).toBe(400)
    expect((await positionsOf(['a'])).get('a')).toEqual({ x: 1, y: 1 })
  })

  it('does not bump the chart revision (moving boxes never conflicts)', async () => {
    await testDb.insert(schema.nodes).values([row('a')])
    await put([{ id: 'a', x: 5, y: 5 }])
    const [c] = await testDb.select({ r: schema.charts.revision }).from(schema.charts).where(eq(schema.charts.id, TEST_CHART_ID))
    expect(c.r).toBe(0)
  })
})
