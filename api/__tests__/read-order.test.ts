import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import handler from '../charts/[id]'
import { captureChart } from '../_lib/snapshots'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID,
} from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

// R-43: a chart read must not depend on the order Postgres happens to store rows in.
const row = (id: string, x: number, y: number) => ({ id, chartId: TEST_CHART_ID, name: id, title: 't', x, y })

async function readIds() {
  const res = createRes()
  await handler(createReq({ query: { id: TEST_CHART_ID } }) as never, res as never)
  const body = res._body as { nodes: Array<{ id: string }>; edges: Array<{ id: string }> }
  return { nodes: body.nodes.map(n => n.id), edges: body.edges.map(e => e.id) }
}

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  await seedChart()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('stable role order (R-43)', () => {
  it('lists roles top to bottom, left to right, id breaking ties, whatever the insert order', async () => {
    await testDb.insert(schema.nodes).values([row('d', 300, 100), row('b', 0, 100), row('z', 0, 0), row('a', 0, 100), row('c', 100, 0)])
    expect((await readIds()).nodes).toEqual(['z', 'c', 'a', 'b', 'd'])
  })

  it('gives the same order after a role is deleted and added back (what undo and restore do)', async () => {
    await testDb.insert(schema.nodes).values([row('n1', 0, 0), row('n2', 100, 0), row('n3', 200, 0)])
    const before = await readIds()
    await testDb.delete(schema.nodes).where(eq(schema.nodes.id, 'n1'))
    await testDb.insert(schema.nodes).values(row('n1', 0, 0))
    expect(await readIds()).toEqual(before)
    expect(before.nodes).toEqual(['n1', 'n2', 'n3'])
  })

  it('orders lines by id, and a version captures roles and lines in the same order', async () => {
    await testDb.insert(schema.nodes).values([row('b', 50, 0), row('a', 0, 0)])
    await testDb.insert(schema.edges).values([
      { id: 'e2', chartId: TEST_CHART_ID, sourceId: 'a', targetId: 'b' },
      { id: 'e1', chartId: TEST_CHART_ID, sourceId: 'b', targetId: 'a' },
    ])
    expect((await readIds()).edges).toEqual(['e1', 'e2'])
    const snap = await captureChart(TEST_CHART_ID)
    expect(snap.nodes.map(n => n.id)).toEqual(['a', 'b'])
    expect(snap.edges.map(e => e.id)).toEqual(['e1', 'e2'])
  })
})
