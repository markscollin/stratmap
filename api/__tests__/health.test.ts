// Roadmap 3.9: /api/health for uptime monitors.
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import { requireAuth, requireUser } from '../_lib/auth'
import handler, { DB_TIMEOUT_MS } from '../health'
import { setupSchema, testDb } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'

const call = async (method = 'GET') => {
  const res = createRes()
  await handler(createReq({ method }) as never, res as never)
  return res
}

beforeAll(async () => { await setupSchema() })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
beforeEach(() => { vi.mocked(requireAuth).mockClear(); vi.mocked(requireUser).mockClear() })

describe('GET /api/health', () => {
  it('is 200 and says the database is fine when it answers', async () => {
    const res = await call()
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ status: 'ok', checks: { database: 'ok' } })
    expect(typeof (res._body as { responseMs: number }).responseMs).toBe('number')
  })

  it('is public: no sign-in is asked for, so a monitor can call it', async () => {
    await call()
    expect(requireAuth).not.toHaveBeenCalled()
    expect(requireUser).not.toHaveBeenCalled()
  })

  it('is never cached', async () => {
    expect((await call())._headers['Cache-Control']).toBe('no-store')
  })

  it('answers HEAD too, as many uptime tools probe with it', async () => {
    expect((await call('HEAD'))._status).toBe(200)
  })

  it('is 503 when the database errors, and says nothing about why', async () => {
    vi.spyOn(testDb, 'execute').mockRejectedValue(new Error('password authentication failed for user "secret-user" at ep-private-host.neon.tech'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call()
    expect(res._status).toBe(503)
    expect(res._body).toMatchObject({ status: 'degraded', checks: { database: 'down' } })
    expect(JSON.stringify(res._body)).not.toMatch(/secret-user|neon\.tech|password/i)
  })

  it('logs the reason for whoever is on call', async () => {
    vi.spyOn(testDb, 'execute').mockRejectedValue(new Error('connection refused'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await call()
    expect(log).toHaveBeenCalledWith('[health] database check failed:', 'connection refused')
  })

  it('is 503 when the database hangs, after the timeout rather than never', async () => {
    vi.useFakeTimers()
    vi.spyOn(testDb, 'execute').mockReturnValue(new Promise(() => {}) as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const pending = call()
    await vi.advanceTimersByTimeAsync(DB_TIMEOUT_MS + 10)
    const res = await pending
    expect(res._status).toBe(503)
    expect(DB_TIMEOUT_MS).toBeLessThanOrEqual(5000) // inside a monitor's usual 10 s limit
  })

  it('rejects other methods', async () => {
    expect((await call('POST'))._status).toBe(405)
    expect((await call('DELETE'))._status).toBe(405)
  })
})
