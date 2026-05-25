import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

vi.mock('../_lib/auth', () => ({
  requireAuth: vi.fn(),
  requireUser: vi.fn(),
}))

const streamMock = {
  on: (event: string, cb: (t: string) => void) => {
    if (event === 'text') cb('RESPONSIBILITIES:\n- Lead the team')
  },
  finalMessage: async () => ({}),
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: () => streamMock }
  },
}))

import { requireAuth } from '../_lib/auth'
import handler from '../ai/draft'
import { setupSchema, cleanDb, seedWorkspace, testDb, TEST_USER_ID, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
  delete process.env.ANTHROPIC_API_KEY
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
})

const draftBody = { title: 'Staff Engineer', deptName: 'Engineering', tone: 'Professional' }

async function setTier(tier: 'free' | 'starter' | 'growth' | 'enterprise') {
  await testDb.update(schema.workspaces).set({ planTier: tier }).where(eq(schema.workspaces.id, TEST_WS_ID))
}

describe('POST /api/ai/draft', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = createRes()
    await handler(createReq({ method: 'GET' }) as never, res as never)
    expect(res._status).toBe(405)
  })

  it('returns 403 for free-tier workspaces', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST', body: draftBody }) as never, res as never)
    expect(res._status).toBe(403)
  })

  it('returns 503 for paid tier when the server key is missing', async () => {
    await setTier('starter')
    const res = createRes()
    await handler(createReq({ method: 'POST', body: draftBody }) as never, res as never)
    expect(res._status).toBe(503)
  })

  it('returns 400 when title/deptName are missing', async () => {
    await setTier('starter')
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    const res = createRes()
    await handler(createReq({ method: 'POST', body: {} }) as never, res as never)
    expect(res._status).toBe(400)
  })

  it('streams the draft for a paid tier with a configured key', async () => {
    await setTier('starter')
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    const res = createRes()
    await handler(createReq({ method: 'POST', body: draftBody }) as never, res as never)
    expect(res._ended).toBe(true)
    expect(res._written).toContain('RESPONSIBILITIES:')
    expect(res._headers['Content-Type']).toContain('text/plain')
  })

  it('allows drafting when an admin trial overrides a free base plan', async () => {
    const future = new Date()
    future.setDate(future.getDate() + 30)
    await testDb.update(schema.workspaces)
      .set({ planTier: 'free', trialPlan: 'growth', trialEndsAt: future })
      .where(eq(schema.workspaces.id, TEST_WS_ID))
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    const res = createRes()
    await handler(createReq({ method: 'POST', body: draftBody }) as never, res as never)
    expect(res._status).not.toBe(403)
    expect(res._written).toContain('RESPONSIBILITIES:')
  })
})
