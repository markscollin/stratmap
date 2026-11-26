// R-70: the chart revision was claimed (committed) before the write, in its own statement. A failed write left a bump behind,
// and a retried DELETE/PUT whose first reply was lost got a false 409 "chart changed". Each case failed before the fix.
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import nodeHandler from '../charts/[id]/nodes/[nodeId]'
import nodesHandler from '../charts/[id]/nodes'
import edgesHandler from '../charts/[id]/edges'
import edgeHandler from '../charts/[id]/edges/[edgeId]'
import chartHandler from '../charts/[id]'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, testDb, TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type H = (req: never, res: never) => unknown
const call = async (handler: H, method: string, query: Record<string, string>, body?: unknown, rev?: number) => {
  const res = createRes()
  await handler(createReq({ method, query, body, headers: rev === undefined ? {} : { 'x-chart-revision': String(rev) } }) as never, res as never)
  return res
}
const revision = async () => (await testDb.select({ r: schema.charts.revision }).from(schema.charts).where(eq(schema.charts.id, TEST_CHART_ID)))[0].r
const execSql = (text: string) => (testDb as unknown as { $client: { exec: (t: string) => Promise<unknown> } }).$client.exec(text)
const failOn = (table: string, op: 'INSERT' | 'DELETE' | 'UPDATE') => execSql(`
  CREATE OR REPLACE FUNCTION fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'write failed'; END $$;
  DROP TRIGGER IF EXISTS fail_write ON ${table};
  CREATE TRIGGER fail_write BEFORE ${op} ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION fail_write();`)
const q = { id: TEST_CHART_ID }

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb(); await seedWorkspace(); await seedChart(); await seedNode()
  await testDb.update(schema.workspaces).set({ planTier: 'growth' })
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  for (const t of ['nodes', 'edges', 'charts']) await execSql(`DROP TRIGGER IF EXISTS fail_write ON ${t}`)
})

describe('retries after a lost reply are not "chart changed" (R-70)', () => {
  it('a DELETE sent again with the revision it was based on is 204, not 409', async () => {
    const rev = await revision()
    expect((await call(nodeHandler, 'DELETE', { ...q, nodeId: TEST_NODE_ID }, undefined, rev))._status).toBe(204)
    expect((await call(nodeHandler, 'DELETE', { ...q, nodeId: TEST_NODE_ID }, undefined, rev))._status).toBe(204)
  })

  it('a PUT sent again with the same change is 200, not 409, and bumps nothing', async () => {
    const rev = await revision()
    expect((await call(nodeHandler, 'PUT', { ...q, nodeId: TEST_NODE_ID }, { title: 'Chief' }, rev))._status).toBe(200)
    const after = await revision()
    const again = await call(nodeHandler, 'PUT', { ...q, nodeId: TEST_NODE_ID }, { title: 'Chief' }, rev)
    expect(again._status).toBe(200)
    expect(await revision()).toBe(after)
  })

  it('a line DELETE sent again is 204, not 409', async () => {
    await testDb.insert(schema.nodes).values({ id: 'n2', chartId: TEST_CHART_ID, name: 'B', title: 'T', x: 0, y: 0 })
    await testDb.insert(schema.edges).values({ id: 'e1', chartId: TEST_CHART_ID, sourceId: TEST_NODE_ID, targetId: 'n2' })
    const rev = await revision()
    expect((await call(edgeHandler, 'DELETE', { ...q, edgeId: 'e1' }, undefined, rev))._status).toBe(204)
    expect((await call(edgeHandler, 'DELETE', { ...q, edgeId: 'e1' }, undefined, rev))._status).toBe(204)
  })

  it('a PUT for a role that is not there is 404 and bumps nothing', async () => {
    const rev = await revision()
    expect((await call(nodeHandler, 'PUT', { ...q, nodeId: 'nope' }, { title: 'X' }))._status).toBe(404)
    expect(await revision()).toBe(rev)
  })

  it('a stale revision is still a 409, with nothing written', async () => {
    const rev = await revision()
    const res = await call(nodeHandler, 'PUT', { ...q, nodeId: TEST_NODE_ID }, { title: 'Late' }, rev + 7)
    expect(res._status).toBe(409)
    expect((await testDb.select().from(schema.nodes))[0].title).toBe('CTO')
  })
})

describe('a failed write leaves no revision bump (R-70)', () => {
  const cases: [string, () => Promise<unknown>, string, 'INSERT' | 'DELETE' | 'UPDATE'][] = [
    ['edit a role', () => call(nodeHandler, 'PUT', { ...q, nodeId: TEST_NODE_ID }, { title: 'New' }), 'nodes', 'UPDATE'],
    ['delete a role', () => call(nodeHandler, 'DELETE', { ...q, nodeId: TEST_NODE_ID }), 'nodes', 'DELETE'],
    ['add a role', () => call(nodesHandler, 'POST', q, { name: 'A', title: 'B', x: 0, y: 0 }), 'nodes', 'INSERT'],
    ['add a line', () => call(edgesHandler, 'POST', q, { sourceId: TEST_NODE_ID, targetId: 'n2' }), 'edges', 'INSERT'],
  ]
  for (const [what, run, table, op] of cases) {
    it(what, async () => {
      if (what === 'add a line') {
        await testDb.insert(schema.nodes).values({ id: 'n2', chartId: TEST_CHART_ID, name: 'B', title: 'T', x: 0, y: 0 })
      }
      const rev = await revision()
      await failOn(table, op)
      const res = await run() as { _status: number }
      expect(res._status).toBe(500)
      expect(await revision()).toBe(rev)
    })
  }

  it('rename a chart', async () => {
    const rev = await revision()
    await execSql(`
      CREATE OR REPLACE FUNCTION fail_rename() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name <> OLD.name THEN RAISE EXCEPTION 'rename failed'; END IF; RETURN NEW; END $$;
      DROP TRIGGER IF EXISTS fail_rename ON charts;
      CREATE TRIGGER fail_rename BEFORE UPDATE ON charts FOR EACH ROW EXECUTE FUNCTION fail_rename();`)
    try {
      expect((await call(chartHandler, 'PUT', q, { name: 'Renamed' }))._status).toBe(500)
      expect(await revision()).toBe(rev)
    } finally {
      await execSql('DROP TRIGGER IF EXISTS fail_rename ON charts')
    }
  })
})
