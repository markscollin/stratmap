import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { hasAnalyticsConsent, storeConsent, CONSENT_KEY } from '../consent'
import { api } from '../apiClient'

function stubFetch() {
  const fn = vi.fn(async (..._args: unknown[]) => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fn)
  return () => new Headers((fn.mock.calls[0][1] as RequestInit).headers)
}

describe('analytics consent', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('is off until the visitor chooses "Accept all"', () => {
    expect(hasAnalyticsConsent()).toBe(false)
    storeConsent('necessary')
    expect(hasAnalyticsConsent()).toBe(false)
    storeConsent('all')
    expect(hasAnalyticsConsent()).toBe(true)
  })

  it('API requests carry X-Analytics-Consent only after "Accept all"', async () => {
    let headers = stubFetch()
    await api.get('/api/workspace')
    expect(headers().get('X-Analytics-Consent')).toBeNull()

    storeConsent('necessary')
    headers = stubFetch()
    await api.get('/api/workspace')
    expect(headers().get('X-Analytics-Consent')).toBeNull()

    storeConsent('all')
    headers = stubFetch()
    await api.get('/api/workspace')
    expect(headers().get('X-Analytics-Consent')).toBe('1')
  })

  it('withdrawing consent stops it on the next request', async () => {
    storeConsent('all')
    localStorage.setItem(CONSENT_KEY, 'necessary')
    const headers = stubFetch()
    await api.get('/api/workspace')
    expect(headers().get('X-Analytics-Consent')).toBeNull()
  })
})
