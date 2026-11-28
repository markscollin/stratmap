// R-78: the BambooHR sync. BambooHR itself is a stub (global fetch); everything else is real: encryption, the routes, the
// update engine, the atomic apply and the daily job's brake.
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import integrationHandler from '../charts/[id]/integration'
import actionHandler from '../charts/[id]/integration/[action]'
import { sealSecret, openSecret, secretBoxReady } from '../_lib/secretBox'
import { bambooSheet, fetchBambooEmployees, BambooError, type BambooEmployee } from '../_lib/bamboohr'
import { runScheduledHrSyncs } from '../_lib/hrSync'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedMember, testDb, TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}
const KEY = 'bamboo-secret-key-1234'
const connect = (body: Record<string, unknown> = { subdomain: 'acme', apiKey: KEY }) =>
  call(integrationHandler, { method: 'PUT', query: { id: TEST_CHART_ID }, body })
const action = (name: 'preview' | 'sync') => call(actionHandler, { method: 'POST', query: { id: TEST_CHART_ID, action: name }, body: {} })
const setTier = (planTier: 'free' | 'growth') => testDb.update(schema.workspaces).set({ planTier }).where(eq(schema.workspaces.id, TEST_WS_ID))

const person = (id: string, first: string, title: string, boss = '', extra: BambooEmployee = {}): BambooEmployee =>
  ({ id, firstName: first, lastName: 'Test', jobTitle: title, supervisorEId: boss, workEmail: `${first.toLowerCase()}@acme.test`, status: 'Active', ...extra })
const COMPANY = [person('1', 'Ada', 'CEO'), person('2', 'Bo', 'CTO', '1'), person('3', 'Cy', 'Engineer', '2')]

let reply: { status: number; body: unknown }
const fetchMock = vi.fn(async () => new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } }))

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  await setTier('growth')
  await seedChart()
  process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  reply = { status: 200, body: { fields: [], employees: COMPANY } }
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})
afterEach(() => { vi.unstubAllGlobals(); delete process.env.INTEGRATION_ENCRYPTION_KEY })

describe('secretBox', () => {
  it('seals and opens; another server key or a damaged value opens to null; no key means not ready', () => {
    const sealed = sealSecret('hello')
    expect(sealed).toMatch(/^v1:/)
    expect(sealed).not.toContain('hello')
    expect(openSecret(sealed)).toBe('hello')
    expect(openSecret(sealed.slice(0, -4) + 'AAAA')).toBeNull()
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
    expect(openSecret(sealed)).toBeNull()
    process.env.INTEGRATION_ENCRYPTION_KEY = 'short'
    expect(secretBoxReady()).toBe(false)
  })
})

describe('the BambooHR adapter', () => {
  it('asks for a JSON custom report with Basic auth, the key as user name, and never follows a redirect', async () => {
    await fetchBambooEmployees('acme', KEY)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.bamboohr.com/api/gateway.php/acme/v1/reports/custom?format=JSON&onlyCurrent=true')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`${KEY}:x`).toString('base64')}`)
    expect(JSON.parse(String(init.body)).fields).toContain('supervisorEId')
    expect(init.redirect).toBe('error')
  })

  it('names each failure, and never calls out for a subdomain that is not one', async () => {
    for (const [status, kind] of [[401, 'bad-key'], [403, 'bad-key'], [404, 'no-such-company'], [429, 'rate-limited'], [503, 'rate-limited'], [500, 'unavailable']] as const) {
      reply = { status, body: {} }
      await expect(fetchBambooEmployees('acme', KEY)).rejects.toMatchObject({ kind })
    }
    reply = { status: 200, body: { nope: true } }
    await expect(fetchBambooEmployees('acme', KEY)).rejects.toMatchObject({ kind: 'bad-reply' })
    fetchMock.mockClear()
    await expect(fetchBambooEmployees('evil.com/x?', KEY)).rejects.toBeInstanceOf(BambooError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('turns the report into the importer\'s table: active people only, preferred names, unknown managers dropped', () => {
    const { sheet } = bambooSheet([
      person('1', 'Ada', 'CEO', '', { preferredName: 'Addy' }),
      person('2', 'Bo', 'CTO', '99'),               // manager not in the list: Bo becomes a top role
      person('3', 'Cy', 'Engineer', '3'),           // reports to themselves: dropped
      person('4', 'Di', 'Gone', '1', { status: 'Inactive' }),
      person('5', 'Ed', 'Designer', '1', { hireDate: '0000-00-00', workEmail: 'ED@ACME.TEST' }),
    ])
    expect(sheet.rows).toEqual([
      ['1', 'Addy Test', 'CEO', '', '', 'ada@acme.test', '', ''],
      ['2', 'Bo Test', 'CTO', '', '', 'bo@acme.test', '', ''],
      ['3', 'Cy Test', 'Engineer', '', '', 'cy@acme.test', '', ''],
      ['5', 'Ed Test', 'Designer', '', '1', 'ed@acme.test', '', ''],
    ])
  })
})

describe('connecting a chart', () => {
  it('tries the key, stores it encrypted, and never sends it back', async () => {
    const res = await connect()
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ connected: true, subdomain: 'acme', keyHint: '1234', autoSync: false })
    expect(JSON.stringify(res._body)).not.toContain(KEY)
    const [row] = await testDb.select().from(schema.hrIntegrations)
    expect(row.apiKeyEncrypted).not.toContain(KEY)
    expect(openSecret(row.apiKeyEncrypted)).toBe(KEY)
    const status = await call(integrationHandler, { method: 'GET', query: { id: TEST_CHART_ID } })
    expect(JSON.stringify(status._body)).not.toContain(KEY)
    expect(status._body).toMatchObject({ connected: true, available: true })
  })

  it('a key BambooHR refuses is not stored, and the reason is given', async () => {
    reply = { status: 401, body: {} }
    const res = await connect()
    expect(res._status).toBe(400)
    expect(res._body).toMatchObject({ error: 'bamboohr-bad-key', message: expect.stringMatching(/refused the API key/) })
    expect(await testDb.select().from(schema.hrIntegrations)).toHaveLength(0)
  })

  it('needs an admin, and Growth or above; without the server key it says so', async () => {
    await seedMember('u-editor', 'editor')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-editor', workspaceId: TEST_WS_ID })
    expect((await connect())._status).toBe(403)
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
    await setTier('free')
    expect((await connect())._status).toBe(402)
    await setTier('growth')
    delete process.env.INTEGRATION_ENCRYPTION_KEY
    expect((await connect())._status).toBe(503)
  })

  it('turns auto-sync on without the key again, but a new subdomain needs the key', async () => {
    await connect()
    fetchMock.mockClear()
    expect((await connect({ subdomain: 'acme', autoSync: true }))._body).toMatchObject({ autoSync: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await connect({ subdomain: 'other' }))._status).toBe(400)
  })

  it('disconnecting removes the connection and leaves the chart alone', async () => {
    await connect()
    expect((await call(integrationHandler, { method: 'DELETE', query: { id: TEST_CHART_ID } }))._status).toBe(204)
    expect(await testDb.select().from(schema.hrIntegrations)).toHaveLength(0)
    const [log] = await testDb.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'integration.disconnected'))
    expect(log).toBeTruthy()
  })
})

describe('preview and Sync now', () => {
  beforeEach(async () => { await connect() })

  it('preview lists the changes and writes nothing', async () => {
    const res = await action('preview')
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ blocked: false, hasChanges: true })
    expect((res._body as { joiners: { label: string }[] }).joiners.map(j => j.label)).toEqual(['Ada Test', 'Bo Test', 'Cy Test'])
    expect(JSON.stringify(res._body)).not.toContain('@acme.test') // no emails in the summary
    expect(await testDb.select().from(schema.nodes).where(eq(schema.nodes.chartId, TEST_CHART_ID))).toHaveLength(0)
  })

  it('Sync now applies it, records the result and logs it; the next run finds nothing to change', async () => {
    const res = await action('sync')
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ result: { status: 'ok', joiners: 3, trigger: 'manual' } })
    const rows = await testDb.select().from(schema.nodes).where(eq(schema.nodes.chartId, TEST_CHART_ID))
    expect(rows.map(r => [r.name, r.externalId]).sort()).toEqual([['Ada Test', '1'], ['Bo Test', '2'], ['Cy Test', '3']])
    const [log] = await testDb.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'chart.synced_from_hr'))
    expect(log.details).toMatchObject({ added: 3, trigger: 'manual' })
    expect((await action('sync'))._body).toMatchObject({ result: { status: 'unchanged' } })
  })

  it('a later run moves, retitles and removes, keeping positions of the people who stay', async () => {
    await action('sync')
    await testDb.update(schema.nodes).set({ x: 777, y: 555 }).where(eq(schema.nodes.externalId, '1'))
    reply = { status: 200, body: { employees: [person('1', 'Ada', 'Chief Executive'), person('3', 'Cy', 'Engineer', '1')] } }
    expect((await action('sync'))._body).toMatchObject({ result: { status: 'ok', leavers: 1, moves: 1, changed: 1 } })
    const rows = await testDb.select().from(schema.nodes).where(eq(schema.nodes.chartId, TEST_CHART_ID))
    expect(rows.map(r => r.name).sort()).toEqual(['Ada Test', 'Cy Test'])
    expect(rows.find(r => r.externalId === '1')).toMatchObject({ title: 'Chief Executive', x: 777, y: 555 })
  })

  it('an empty BambooHR list never empties the chart', async () => {
    await action('sync')
    reply = { status: 200, body: { employees: [] } }
    const res = await action('sync')
    expect(res._status).toBe(502)
    expect((res._body as { message: string }).message).toMatch(/listed nobody/)
    expect(await testDb.select().from(schema.nodes).where(eq(schema.nodes.chartId, TEST_CHART_ID))).toHaveLength(3)
  })

  it('a stale canvas revision changes nothing (409)', async () => {
    const res = await call(actionHandler, { method: 'POST', query: { id: TEST_CHART_ID, action: 'sync' }, body: {}, headers: { 'x-chart-revision': '99' } })
    expect(res._status).toBe(409)
    expect(await testDb.select().from(schema.nodes).where(eq(schema.nodes.chartId, TEST_CHART_ID))).toHaveLength(0)
  })

  it('viewers cannot preview or sync', async () => {
    await seedMember('u-viewer', 'viewer')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-viewer', workspaceId: TEST_WS_ID })
    expect((await action('preview'))._status).toBe(403)
    expect((await action('sync'))._status).toBe(403)
  })
})

describe('the daily sync', () => {
  const big = Array.from({ length: 20 }, (_, i) => person(String(i + 1), `P${i + 1}`, 'Engineer', i ? '1' : ''))

  it('applies changes for charts with auto-sync on, as StratMap, and skips the rest', async () => {
    await connect({ subdomain: 'acme', apiKey: KEY, autoSync: true })
    expect(await runScheduledHrSyncs()).toMatchObject({ synced: 1, held: 0, failed: 0 })
    const [log] = await testDb.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'chart.synced_from_hr'))
    expect(log).toMatchObject({ actorUserId: 'system', details: expect.objectContaining({ trigger: 'scheduled' }) })
    await testDb.update(schema.hrIntegrations).set({ autoSync: false })
    expect(await runScheduledHrSyncs()).toMatchObject({ synced: 0, skipped: 0 })
  })

  it('holds, changing nothing, when many people would leave at once', async () => {
    reply = { status: 200, body: { employees: big } }
    await connect({ subdomain: 'acme', apiKey: KEY, autoSync: true })
    await runScheduledHrSyncs()
    reply = { status: 200, body: { employees: big.slice(0, 10) } } // 10 of 20 would go
    expect(await runScheduledHrSyncs()).toMatchObject({ held: 1, synced: 0 })
    expect(await testDb.select().from(schema.nodes).where(eq(schema.nodes.chartId, TEST_CHART_ID))).toHaveLength(20)
    const [row] = await testDb.select().from(schema.hrIntegrations)
    expect(row.lastResult).toMatchObject({ status: 'held', leavers: 10, reason: expect.stringMatching(/10 people would be removed/) })
    // A person can still apply it after looking at the preview.
    expect((await action('sync'))._body).toMatchObject({ result: { status: 'ok', leavers: 10 } })
  })

  it('skips a workspace whose plan no longer has the feature', async () => {
    await connect({ subdomain: 'acme', apiKey: KEY, autoSync: true })
    await setTier('free')
    expect(await runScheduledHrSyncs()).toMatchObject({ skipped: 1, synced: 0 })
  })

  it('records a failure from BambooHR and keeps going', async () => {
    await connect({ subdomain: 'acme', apiKey: KEY, autoSync: true })
    reply = { status: 401, body: {} }
    expect(await runScheduledHrSyncs()).toMatchObject({ failed: 1 })
    const [row] = await testDb.select().from(schema.hrIntegrations)
    expect(row.lastResult).toMatchObject({ status: 'failed', reason: expect.stringMatching(/refused the API key/) })
  })
})
