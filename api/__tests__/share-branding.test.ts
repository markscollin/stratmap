// Roadmap 2.6: public share pages of Free workspaces carry the "Made with StratMap" mark.
// The API exposes only a boolean, never the plan.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import { eq } from 'drizzle-orm'
import publicShareHandler from '../share/[code]'
import { setupSchema, cleanDb, seedWorkspace, seedChart, testDb, TEST_WS_ID, TEST_CHART_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

async function getShare() {
  const res = createRes()
  await publicShareHandler(createReq({ method: 'GET', query: { code: 'brandcode0000001' } }) as never, res as never)
  return res
}

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  await seedChart()
  await testDb.update(schema.charts).set({ isPublic: true }).where(eq(schema.charts.id, TEST_CHART_ID))
  await testDb.insert(schema.sharedLinks).values({ id: 'brandcode0000001', chartId: TEST_CHART_ID, createdBy: 'u-test' })
})

describe('GET /api/share/:code branding flag', () => {
  it('is true for a Free workspace', async () => {
    const res = await getShare()
    expect(res._status).toBe(200)
    expect((res._body as { branding: boolean }).branding).toBe(true)
  })

  it.each(['starter', 'growth', 'enterprise'] as const)('is false for %s', async (planTier) => {
    await testDb.update(schema.workspaces).set({ planTier }).where(eq(schema.workspaces.id, TEST_WS_ID))
    expect((await getShare())._body).toMatchObject({ branding: false })
  })

  it('follows a downgrade back to Free', async () => {
    await testDb.update(schema.workspaces).set({ planTier: 'starter' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    expect((await getShare())._body).toMatchObject({ branding: false })
    await testDb.update(schema.workspaces).set({ planTier: 'free' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    expect((await getShare())._body).toMatchObject({ branding: true })
  })

  it('never exposes the plan itself or the workspace', async () => {
    const body = JSON.stringify((await getShare())._body)
    expect(body).not.toMatch(/planTier|workspaceId|starter|"free"/)
  })
})
