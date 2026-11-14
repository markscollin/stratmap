// Launch review R-17: emails and redirects used the per-deployment host even on production.
import { describe, it, expect } from 'vitest'
import { resolveOrigin, missingAppUrlInProduction } from '../siteOrigin'

const prod = { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'stratmap.app', VERCEL_URL: 'stratmap-abc123.vercel.app' }

describe('resolveOrigin', () => {
  it('production: APP_URL wins, then the stable production domain, then the deployment host', () => {
    expect(resolveOrigin({ ...prod, APP_URL: 'https://app.example.com/' })).toBe('https://app.example.com')
    expect(resolveOrigin(prod)).toBe('https://stratmap.app') // not stratmap-abc123.vercel.app
    expect(resolveOrigin({ VERCEL_ENV: 'production', VERCEL_URL: 'stratmap-abc123.vercel.app' })).toBe('https://stratmap-abc123.vercel.app')
  })

  it('preview: links come back to THAT preview, not to production (so the test-mode billing check stays on the preview)', () => {
    const preview = { ...prod, VERCEL_ENV: 'preview', VERCEL_URL: 'stratmap-git-branch.vercel.app' }
    expect(resolveOrigin(preview)).toBe('https://stratmap-git-branch.vercel.app')
    expect(resolveOrigin({ ...preview, APP_URL: 'https://stratmap.app' })).toBe('https://stratmap-git-branch.vercel.app')
  })

  it('local and tests: APP_URL if set, else nothing', () => {
    expect(resolveOrigin({ APP_URL: 'http://localhost:3000' })).toBe('http://localhost:3000')
    expect(resolveOrigin({})).toBeNull()
  })

  it('rejects anything that is not a plain http(s) URL or a plain host', () => {
    expect(resolveOrigin({ APP_URL: 'javascript:alert(1)' })).toBeNull()
    expect(resolveOrigin({ APP_URL: 'not a url' })).toBeNull()
    expect(resolveOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'evil.com"><script>' })).toBeNull()
  })
})

describe('missingAppUrlInProduction', () => {
  it('is true only on production without a valid APP_URL', () => {
    expect(missingAppUrlInProduction(prod)).toBe(true)
    expect(missingAppUrlInProduction({ ...prod, APP_URL: 'https://stratmap.app' })).toBe(false)
    expect(missingAppUrlInProduction({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(missingAppUrlInProduction({})).toBe(false)
  })
})
