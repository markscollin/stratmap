// Launch review R-26: a public share link shows an explicit allow-list of role fields, and expired, private, revoked and unknown links look the same.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

import { getTableColumns, eq } from 'drizzle-orm'
import handler from '../share/[code]'
import { SHARED_NODE_FIELDS, PRIVATE_NODE_FIELDS, publicNode } from '../_lib/sharedFields'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, testDb, TEST_CHART_ID, TEST_NODE_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

const CODE = 'abcDEF1234567890'
const get = async (code: string) => {
  const res = createRes()
  await handler(createReq({ method: 'GET', query: { code }, headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` } }) as never, res as never)
  return res
}

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb(); await seedWorkspace(); await seedChart(); await seedNode()
  await testDb.update(schema.charts).set({ isPublic: true }).where(eq(schema.charts.id, TEST_CHART_ID))
  await testDb.insert(schema.sharedLinks).values({ id: CODE, chartId: TEST_CHART_ID, createdBy: 'u' })
})

describe('the allow-list', () => {
  it('names every column of nodes, either as shared or as deliberately private (fails when a column is added without a decision)', () => {
    const columns = Object.keys(getTableColumns(schema.nodes)).sort()
    const decided = [...SHARED_NODE_FIELDS, ...PRIVATE_NODE_FIELDS].sort()
    expect(decided, 'A new column on `nodes` must be added to SHARED_NODE_FIELDS (public) or PRIVATE_NODE_FIELDS in api/_lib/sharedFields.ts').toEqual(columns)
  })

  it('publicNode drops anything not listed, even if the row has more keys', () => {
    const row = { id: 'n', chartId: 'c', name: 'A', title: 'T', secretNote: 'x', email: 'a@b.c' } as never
    const out = publicNode(row) as Record<string, unknown>
    expect(Object.keys(out).sort()).toEqual([...SHARED_NODE_FIELDS].sort())
    expect(out.secretNote).toBeUndefined()
    expect(out.email).toBeUndefined()
    expect(out.chartId).toBeUndefined()
  })

  it('the share response carries exactly the allowed fields per role', async () => {
    const res = await get(CODE)
    expect(res._status).toBe(200)
    const [node] = (res._body as { nodes: Record<string, unknown>[] }).nodes
    expect(Object.keys(node).sort()).toEqual([...SHARED_NODE_FIELDS].sort())
    expect(node.id).toBe(TEST_NODE_ID)
  })
})

describe('unknown, private, revoked and expired links answer identically', () => {
  it('all give the same status and body', async () => {
    const unknown = await get('doesnotexist12345')
    await testDb.update(schema.charts).set({ isPublic: false }).where(eq(schema.charts.id, TEST_CHART_ID))
    const priv = await get(CODE)
    await testDb.update(schema.charts).set({ isPublic: true }).where(eq(schema.charts.id, TEST_CHART_ID))
    await testDb.update(schema.sharedLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.sharedLinks.id, CODE))
    const expired = await get(CODE)
    await testDb.delete(schema.sharedLinks)
    const revoked = await get(CODE)
    for (const r of [priv, expired, revoked]) {
      expect(r._status).toBe(404)
      expect(r._body).toEqual(unknown._body)
    }
    expect(unknown._status).toBe(404)
  })
})
