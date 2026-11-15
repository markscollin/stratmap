// R-33: the role limit and the sample-chart cap hold when requests arrive together, and the sample cap holds after creation.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, count } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import nodesHandler from '../charts/[id]/nodes'
import importHandler from '../charts/[id]/import'
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
const q = { id: TEST_CHART_ID }
const roles = async () => (await testDb.select({ n: count() }).from(schema.nodes).where(eq(schema.nodes.chartId, TEST_CHART_ID)))[0].n
async function fillTo(total: number) {
  const have = await roles()
  const rows = Array.from({ length: total - have }, (_, i) => ({ id: `fill-${i}`, chartId: TEST_CHART_ID, name: `P${i}`, title: 'Eng', x: 0, y: 0 }))
  if (rows.length) await testDb.insert(schema.nodes).values(rows)
}
const addRole = (name: string) => call(nodesHandler, { method: 'POST', query: q, body: { name, title: 'Engineer', x: 0, y: 0 } })

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace() // Free: 30 roles a chart
  await seedChart()
  await seedNode()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('role limit under parallel requests', () => {
  it('never ends up over the limit when several adds arrive together at the edge', async () => {
    await fillTo(29) // one slot left
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => addRole(`Racer ${i}`)))
    expect(await roles()).toBeLessThanOrEqual(30)
    expect(results.filter(r => r._status === 201).length).toBeLessThanOrEqual(1)
    for (const r of results.filter(r => r._status !== 201)) {
      expect(r._status).toBe(402)
      expect(r._body).toMatchObject({ error: 'plan-limit', limit: 'nodes' })
    }
  })

  it('a refused racer leaves nothing behind, and the chart accepts exactly the roles that fit', async () => {
    await fillTo(30)
    const res = await addRole('One too many')
    expect(res._status).toBe(402)
    expect(await roles()).toBe(30)
    const rows = await testDb.select().from(schema.nodes).where(eq(schema.nodes.name, 'One too many'))
    expect(rows).toHaveLength(0)
  })

  it('a single add with room still works', async () => {
    await fillTo(10)
    const res = await addRole('Fits')
    expect(res._status).toBe(201)
    expect(await roles()).toBe(11)
  })
})

describe('the sample chart stays small after it is created', () => {
  beforeEach(async () => { await testDb.update(schema.charts).set({ isSample: true }).where(eq(schema.charts.id, TEST_CHART_ID)) })

  it('adding a role past 20 is refused, and one under 20 is fine', async () => {
    await fillTo(19)
    expect((await addRole('Twentieth'))._status).toBe(201)
    const res = await addRole('Twenty-first')
    expect(res._status).toBe(400)
    expect(res._body).toMatchObject({ error: 'sample-too-large' })
    expect(await roles()).toBe(20)
  })

  it('parallel adds cannot take a sample past 20 either', async () => {
    await fillTo(19)
    await Promise.all(Array.from({ length: 5 }, (_, i) => addRole(`R${i}`)))
    expect(await roles()).toBeLessThanOrEqual(20)
  })

  it('an import that would take it past 20 is refused whole', async () => {
    await fillTo(15)
    const nodes = Array.from({ length: 6 }, (_, i) => ({ id: `imp-${i}`, name: `I${i}`, title: 'Eng', x: 0, y: 0 }))
    const res = await call(importHandler, { method: 'POST', query: q, body: { nodes, edges: [], departments: [] } })
    expect(res._status).toBe(400)
    expect(res._body).toMatchObject({ error: 'sample-too-large' })
    expect(await roles()).toBe(15)
    const ok = await call(importHandler, { method: 'POST', query: q, body: { nodes: nodes.slice(0, 5), edges: [], departments: [] } })
    expect(ok._status).toBe(201)
    expect(await roles()).toBe(20)
  })

  it('an ordinary chart is not capped at 20', async () => {
    await testDb.update(schema.charts).set({ isSample: false }).where(eq(schema.charts.id, TEST_CHART_ID))
    await fillTo(25)
    expect((await addRole('Twenty-sixth'))._status).toBe(201)
  })
})
