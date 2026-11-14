import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getAppUrl } from '../_lib/url'

const KEYS = ['APP_URL', 'VERCEL_ENV', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'] as const
let saved: Record<string, string | undefined>
beforeEach(() => { saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]])); KEYS.forEach(k => delete process.env[k]) })
afterEach(() => { KEYS.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }); vi.restoreAllMocks() })

describe('getAppUrl (R-17)', () => {
  it('production without APP_URL uses the stable production domain, not the per-deployment host, and logs a warning', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.assign(process.env, { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'stratmap.app', VERCEL_URL: 'stratmap-abc.vercel.app' })
    expect(getAppUrl()).toBe('https://stratmap.app')
    expect(err.mock.calls.join(' ')).toContain('APP_URL is not set')
  })
  it('APP_URL wins on production', () => {
    Object.assign(process.env, { VERCEL_ENV: 'production', APP_URL: 'https://app.example.com', VERCEL_URL: 'x.vercel.app' })
    expect(getAppUrl()).toBe('https://app.example.com')
  })
  it('a preview links back to itself', () => {
    Object.assign(process.env, { VERCEL_ENV: 'preview', VERCEL_URL: 'stratmap-git-x.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'stratmap.app' })
    expect(getAppUrl()).toBe('https://stratmap-git-x.vercel.app')
  })
  it('falls back to localhost with nothing set', () => {
    expect(getAppUrl()).toBe('http://localhost:3000')
  })
})
