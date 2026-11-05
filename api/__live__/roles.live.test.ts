// Role search + chart-list counts on a real Neon database (neon-http driver).
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'

vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { db } from '../_lib/db'
import * as schema from '../../src/lib/db/schema'
import searchHandler from '../roles/search'
import chartsHandler from '../charts/index'
import { createReq } from '../__tests__/helpers/req'
import { createRes } from '../__tests__/helpers/res'

const RUN = `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const WS = `ws-${RUN}`
const CHART = `chart-${RUN}`

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for live tests')
if (process.env.VERCEL_ENV === 'production') throw new Error('Refusing to run live tests against production')

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: WS, name: 'Live', ownerId: `u-${RUN}`, ownerRole: 'Founder/CEO', size: '1-10' })
  await db.insert(schema.workspaceMembers).values({ id: `wm-${RUN}`, workspaceId: WS, userId: `u-${RUN}`, email: `o-${RUN}@example.test`, permission: 'owner' })
  await db.insert(schema.charts).values({ id: CHART, workspaceId: WS, name: 'Live chart', ownerId: `u-${RUN}`, creatorId: `u-${RUN}` })
  await db.insert(schema.departments).values({ id: `d-${RUN}`, chartId: CHART, name: 'Engineering', colour: '#0EA5E9' })
  await db.insert(schema.nodes).values([
    { id: `n1-${RUN}`, chartId: CHART, name: 'Priya', title: 'QA Engineer', departmentId: `d-${RUN}`, x: 0, y: 0 },
    { id: `n2-${RUN}`, chartId: CHART, name: 'QA Engineer', title: 'QA Engineer', status: 'open', x: 0, y: 0 },
  ])
  vi.mocked(requireAuth).mockResolvedValue({ userId: `u-${RUN}`, workspaceId: WS })
})

afterAll(async () => {
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, WS))
})

describe('roles search + chart counts on Neon', () => {
  it('search finds both QA roles with department and person', async () => {
    const res = createRes()
    await searchHandler(createReq({ method: 'GET', query: { q: 'qa eng' } }) as never, res as never)
    const { results } = res._body as { results: { person: string | null; dept: string | null }[] }
    expect(results).toHaveLength(2)
    expect(results.map(r => r.person).sort()).toEqual(['Priya', null].sort())
  })

  it('chart list carries real counts', async () => {
    const res = createRes()
    await chartsHandler(createReq({ method: 'GET' }) as never, res as never)
    expect(res._body).toEqual([expect.objectContaining({ id: CHART, nodeCount: 2, deptCount: 1 })])
  })
})
