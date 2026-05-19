import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

vi.mock('../_lib/auth', () => ({
  requireAuth: vi.fn(),
  requireUser: vi.fn(),
}))

import { requireAuth } from '../_lib/auth'
import handler from '../charts/index'
import { setupSchema, cleanDb, seedWorkspace, seedChart, testDb, TEST_USER_ID, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('GET /api/charts', () => {
  it('returns empty array when no charts exist', async () => {
    const res = createRes()
    await handler(createReq() as never, res as never)
    expect(res._status).toBe(200)
    expect(res._body).toEqual([])
  })

  it('returns charts ordered by updatedAt descending', async () => {
    await testDb.insert(schema.charts).values([
      { id: 'c-1', workspaceId: TEST_WS_ID, name: 'Alpha', ownerId: TEST_USER_ID, creatorId: TEST_USER_ID, version: 1 },
      { id: 'c-2', workspaceId: TEST_WS_ID, name: 'Beta', ownerId: TEST_USER_ID, creatorId: TEST_USER_ID, version: 1 },
    ])
    const res = createRes()
    await handler(createReq() as never, res as never)
    const body = res._body as { id: string }[]
    expect(body).toHaveLength(2)
  })

  it('only returns charts belonging to the authenticated workspace', async () => {
    // Chart in a different workspace
    await testDb.insert(schema.workspaces).values({ id: 'ws-other', name: 'Other', ownerId: 'u-other', ownerRole: 'CEO', size: '1-10' })
    await testDb.insert(schema.charts).values({ id: 'c-other', workspaceId: 'ws-other', name: 'Other Chart', ownerId: 'u-other', creatorId: 'u-other', version: 1 })
    await testDb.insert(schema.charts).values({ id: 'c-mine', workspaceId: TEST_WS_ID, name: 'My Chart', ownerId: TEST_USER_ID, creatorId: TEST_USER_ID, version: 1 })

    const res = createRes()
    await handler(createReq() as never, res as never)
    const body = res._body as { id: string }[]
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('c-mine')
  })
})

describe('POST /api/charts', () => {
  it('creates a blank chart and returns 201', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { name: 'New Chart' } }) as never, res as never)
    expect(res._status).toBe(201)
    const body = res._body as { name: string; workspaceId: string }
    expect(body.name).toBe('New Chart')
    expect(body.workspaceId).toBe(TEST_WS_ID)
  })

  it('returns 400 when name is missing', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST', body: {} }) as never, res as never)
    expect(res._status).toBe(400)
  })

  it('seeds nodes from template with fresh IDs', async () => {
    const templateNodes = [
      { id: 'tmpl-node-1', name: 'Alice', title: 'CEO', x: 0, y: 0 },
      { id: 'tmpl-node-2', name: 'Bob', title: 'CTO', x: 0, y: 100, managerId: 'tmpl-node-1' },
    ]
    const templateEdges = [
      { id: 'tmpl-edge-1', sourceId: 'tmpl-node-1', targetId: 'tmpl-node-2' },
    ]
    const templateDepts = [
      { id: 'tmpl-dept-1', name: 'Engineering', colour: '#0EA5E9' },
    ]

    const res = createRes()
    await handler(
      createReq({ method: 'POST', body: { name: 'From Template', templateNodes, templateEdges, templateDepts } }) as never,
      res as never,
    )
    expect(res._status).toBe(201)

    const chart = res._body as { id: string }
    const nodes = await testDb.select().from(schema.nodes)
    expect(nodes).toHaveLength(2)
    // IDs must not be the template IDs
    expect(nodes.map(n => n.id)).not.toContain('tmpl-node-1')
    expect(nodes.map(n => n.id)).not.toContain('tmpl-node-2')
    // managerId must be remapped to the new node ID
    const cto = nodes.find(n => n.title === 'CTO')!
    const ceo = nodes.find(n => n.title === 'CEO')!
    expect(cto.managerId).toBe(ceo.id)
    // Chart ID must match
    expect(nodes.every(n => n.chartId === chart.id)).toBe(true)
  })

  it('template seeding is idempotent — second chart from same template succeeds', async () => {
    const templateNodes = [{ id: 'tmpl-node-1', name: 'Alice', title: 'CEO', x: 0, y: 0 }]
    const templateDepts = [{ id: 'tmpl-dept-1', name: 'Eng', colour: '#0EA5E9' }]

    const res1 = createRes()
    await handler(createReq({ method: 'POST', body: { name: 'Chart A', templateNodes, templateDepts } }) as never, res1 as never)
    expect(res1._status).toBe(201)

    const res2 = createRes()
    await handler(createReq({ method: 'POST', body: { name: 'Chart B', templateNodes, templateDepts } }) as never, res2 as never)
    // This was the bug: duplicate PK error caused 500 on second use of same template
    expect(res2._status).toBe(201)

    const charts = await testDb.select().from(schema.charts)
    expect(charts).toHaveLength(2)
  })

  it('remaps departmentId foreign key in nodes when seeding from template', async () => {
    const templateDepts = [{ id: 'tmpl-dept-1', name: 'Engineering', colour: '#blue' }]
    const templateNodes = [{ id: 'tmpl-node-1', name: 'Alice', title: 'CTO', x: 0, y: 0, departmentId: 'tmpl-dept-1' }]

    const res = createRes()
    await handler(createReq({ method: 'POST', body: { name: 'Chart', templateNodes, templateDepts } }) as never, res as never)
    expect(res._status).toBe(201)

    const dept = (await testDb.select().from(schema.departments))[0]
    const node = (await testDb.select().from(schema.nodes))[0]
    expect(node.departmentId).toBe(dept.id)
    expect(node.departmentId).not.toBe('tmpl-dept-1')
  })

  it('returns 405 for unsupported methods', async () => {
    const res = createRes()
    await handler(createReq({ method: 'DELETE' }) as never, res as never)
    expect(res._status).toBe(405)
  })
})
