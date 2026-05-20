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
import listHandler from '../templates'
import itemHandler from '../templates/[id]'
import { setupSchema, cleanDb, seedWorkspace, testDb, TEST_USER_ID, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

const TEST_TMPL_ID = 'tmpl-test'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

async function seedTemplate(overrides: Partial<typeof schema.roleTemplates.$inferInsert> = {}) {
  await testDb.insert(schema.roleTemplates).values({
    id: TEST_TMPL_ID,
    workspaceId: TEST_WS_ID,
    title: 'Senior Engineer',
    department: 'Engineering',
    responsibilities: 'Lead feature development',
    requirements: '5+ years experience',
    tags: ['IC', 'Technical'],
    uses: 2,
    createdBy: TEST_USER_ID,
    updatedBy: TEST_USER_ID,
    ...overrides,
  })
}

describe('GET /api/templates', () => {
  it('returns empty array when no templates exist', async () => {
    const res = createRes()
    await listHandler(createReq() as never, res as never)
    expect(res._status).toBe(200)
    expect(res._body).toEqual([])
  })

  it('returns templates for the authenticated workspace', async () => {
    await seedTemplate()
    const res = createRes()
    await listHandler(createReq() as never, res as never)
    const body = res._body as { id: string; title: string }[]
    expect(body).toHaveLength(1)
    expect(body[0].title).toBe('Senior Engineer')
  })

  it('does not return templates from other workspaces', async () => {
    await testDb.insert(schema.workspaces).values({ id: 'ws-other', name: 'Other', ownerId: 'u-other', ownerRole: 'CEO', size: '1-10' })
    await testDb.insert(schema.roleTemplates).values({
      id: 'tmpl-other', workspaceId: 'ws-other', title: 'Stranger', department: 'Eng',
      createdBy: 'u-other', updatedBy: 'u-other',
    })
    await seedTemplate()

    const res = createRes()
    await listHandler(createReq() as never, res as never)
    const body = res._body as { id: string }[]
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(TEST_TMPL_ID)
  })
})

describe('POST /api/templates', () => {
  it('creates a template and returns 201', async () => {
    const res = createRes()
    await listHandler(
      createReq({ method: 'POST', body: { title: 'Product Manager', department: 'Product', tags: ['IC'] } }) as never,
      res as never,
    )
    expect(res._status).toBe(201)
    const body = res._body as { title: string; workspaceId: string; createdBy: string }
    expect(body.title).toBe('Product Manager')
    expect(body.workspaceId).toBe(TEST_WS_ID)
    expect(body.createdBy).toBe(TEST_USER_ID)
  })

  it('returns 400 when title is missing', async () => {
    const res = createRes()
    await listHandler(createReq({ method: 'POST', body: { department: 'Engineering' } }) as never, res as never)
    expect(res._status).toBe(400)
  })
})

describe('PUT /api/templates/:id', () => {
  it('updates a template', async () => {
    await seedTemplate()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: TEST_TMPL_ID }, body: { title: 'Staff Engineer', responsibilities: 'Lead multiple teams' } }) as never,
      res as never,
    )
    expect(res._status).toBe(200)
    const body = res._body as { title: string; responsibilities: string }
    expect(body.title).toBe('Staff Engineer')
    expect(body.responsibilities).toBe('Lead multiple teams')
  })

  it('preserves unchanged fields', async () => {
    await seedTemplate()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: TEST_TMPL_ID }, body: { title: 'Staff Engineer' } }) as never,
      res as never,
    )
    const body = res._body as { requirements: string }
    expect(body.requirements).toBe('5+ years experience')
  })

  it('returns 404 when template does not belong to workspace', async () => {
    await seedTemplate()
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: 'ws-other' })
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: TEST_TMPL_ID }, body: { title: 'Hacked' } }) as never,
      res as never,
    )
    expect(res._status).toBe(404)
  })
})

describe('DELETE /api/templates/:id', () => {
  it('deletes a template and returns 204', async () => {
    await seedTemplate()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'DELETE', query: { id: TEST_TMPL_ID } }) as never,
      res as never,
    )
    expect(res._status).toBe(204)

    const remaining = await testDb.select().from(schema.roleTemplates)
    expect(remaining).toHaveLength(0)
  })

  it('returns 404 when template does not belong to workspace', async () => {
    await seedTemplate()
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: 'ws-other' })
    const res = createRes()
    await itemHandler(
      createReq({ method: 'DELETE', query: { id: TEST_TMPL_ID } }) as never,
      res as never,
    )
    expect(res._status).toBe(404)
  })

  it('returns 405 for unsupported methods', async () => {
    await seedTemplate()
    const res = createRes()
    await itemHandler(createReq({ method: 'POST', query: { id: TEST_TMPL_ID } }) as never, res as never)
    expect(res._status).toBe(405)
  })
})
