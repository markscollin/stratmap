import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import { requireUser } from '../_lib/auth'
import handler from '../workspaces'
import { setupSchema, cleanDb, testDb } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  vi.mocked(requireUser).mockResolvedValue({ userId: 'u-1' })
  const future = new Date(Date.now() + 86_400_000)
  await testDb.insert(schema.workspaces).values([
    { id: 'ws-1', name: 'Acme', ownerId: 'u-1', ownerRole: 'Founder/CEO', size: '1-10', planTier: 'starter' },
    { id: 'ws-2', name: 'Beta', ownerId: 'u-2', ownerRole: 'Founder/CEO', size: '1-10', planTier: 'free', trialPlan: 'growth', trialEndsAt: future },
    { id: 'ws-3', name: 'Secret', ownerId: 'u-3', ownerRole: 'Founder/CEO', size: '1-10' },
  ])
  await testDb.insert(schema.workspaceMembers).values([
    { id: 'm1', workspaceId: 'ws-1', userId: 'u-1', email: 'a@co.com', permission: 'owner', joinedAt: new Date('2026-01-01') },
    { id: 'm2', workspaceId: 'ws-2', userId: 'u-1', email: 'a@co.com', permission: 'editor', joinedAt: new Date('2026-02-01') },
    { id: 'm3', workspaceId: 'ws-3', userId: 'u-3', email: 'c@co.com', permission: 'owner' },
  ])
})

describe('GET /api/workspaces', () => {
  it('lists only the caller\'s workspaces, oldest membership first, each with its own plan and role', async () => {
    const res = createRes()
    await handler(createReq({ method: 'GET' }) as never, res as never)
    expect(res._status).toBe(200)
    expect(res._body).toEqual({
      workspaces: [
        { id: 'ws-1', name: 'Acme', myPermission: 'owner', planTier: 'starter' },
        // An active admin trial counts, like everywhere else.
        { id: 'ws-2', name: 'Beta', myPermission: 'editor', planTier: 'growth' },
      ],
      deleted: [],   // workspaces this person deleted and can still restore (roadmap 4.2)
    })
  })

  it('is empty for a user with no workspace', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u-nobody' })
    const res = createRes()
    await handler(createReq({ method: 'GET' }) as never, res as never)
    expect(res._body).toEqual({ workspaces: [], deleted: [] })
  })

  it('returns 405 for other methods', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST' }) as never, res as never)
    expect(res._status).toBe(405)
  })
})
