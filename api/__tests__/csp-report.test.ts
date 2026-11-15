// Launch review R-23: the endpoint that receives Content-Security-Policy violation reports.
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

import handler from '../csp-report'
import { coarseUrl, parseCspReports } from '../_lib/cspReport'
import { setupSchema, cleanDb } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'

const legacy = (over: Record<string, unknown> = {}) => ({ 'csp-report': {
  'document-uri': 'https://app.example.com/invite/SECRET-TOKEN?email=a@b.c#frag', 'violated-directive': 'script-src-elem', 'effective-directive': 'script-src-elem',
  'blocked-uri': 'https://evil.example.net/scripts/x.js?token=abc', disposition: 'report', 'source-file': 'https://app.example.com/assets/index-1.js', 'line-number': 12, ...over } })

let warn: { mock: { calls: unknown[][] }; mockRestore: () => void }
beforeAll(async () => { await setupSchema() })
beforeEach(async () => { await cleanDb(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => warn.mockRestore())

const post = async (body: unknown, ip = '9.9.9.9') => {
  const res = createRes()
  await handler(createReq({ method: 'POST', body, headers: { 'x-forwarded-for': ip } }) as never, res as never)
  return res
}
const logged = () => warn.mock.calls.map((c: unknown[]) => String(c[0])).filter((l: string) => l.startsWith('[csp]'))

describe('POST /api/csp-report', () => {
  it('logs one trimmed line per report and answers 204', async () => {
    const res = await post(legacy())
    expect(res._status).toBe(204)
    expect(logged()).toHaveLength(1)
    expect(logged()[0]).toContain('script-src-elem')
    expect(logged()[0]).toContain('blocked=https://evil.example.net/scripts ')
  })

  it('never logs the secret parts of a URL: query, fragment, or any path segment after the first', async () => {
    await post(legacy())
    const line = logged().join('\n')
    expect(line).toContain('page=https://app.example.com/invite ')
    for (const secret of ['SECRET-TOKEN', 'email=', 'a@b.c', 'frag', 'token=abc', 'x.js']) expect(line).not.toContain(secret)
  })

  it('understands the Reporting API shape too (report-to)', async () => {
    const res = await post([{ type: 'csp-violation', body: { documentURL: 'https://app.example.com/share/CODE123', blockedURL: 'inline', effectiveDirective: 'script-src', disposition: 'report', lineNumber: 3 } }])
    expect(res._status).toBe(204)
    expect(logged()[0]).toContain('page=https://app.example.com/share ')
    expect(logged()[0]).not.toContain('CODE123')
  })

  it('accepts a JSON string or buffer body (application/csp-report is not parsed by the platform)', async () => {
    await post(JSON.stringify(legacy()))
    await post(Buffer.from(JSON.stringify(legacy())))
    expect(logged()).toHaveLength(2)
  })

  it('ignores junk quietly (still 204) and logs nothing', async () => {
    for (const body of [null, 'not json', 42, {}, [], [{ type: 'deprecation' }], { 'csp-report': 'x' }]) expect((await post(body))._status).toBe(204)
    expect(logged()).toEqual([])
  })

  it('caps a flood in one request and rate limits an address', async () => {
    await post(Array.from({ length: 50 }, () => ({ type: 'csp-violation', body: { effectiveDirective: 'img-src' } })), '1.1.1.1')
    expect(logged()).toHaveLength(10)
    let last = 204
    for (let i = 0; i < 35; i++) last = (await post(legacy(), '2.2.2.2'))._status
    expect(last).toBe(429)
  })

  it('only takes POST', async () => {
    const res = createRes()
    await handler(createReq({ method: 'GET' }) as never, res as never)
    expect(res._status).toBe(405)
  })
})

describe('coarseUrl and parseCspReports', () => {
  it('keeps the origin and the first path segment only', () => {
    expect(coarseUrl('https://a.test/x/y/z?q=1#h')).toBe('https://a.test/x')
    expect(coarseUrl('https://a.test/')).toBe('https://a.test')
    expect(coarseUrl('data:text/plain;base64,AAAA')).toBe('data:')
    expect(coarseUrl('inline')).toBe('inline')
    expect(coarseUrl('"><script>alert(1)</script>')).not.toMatch(/[<>"()]/)
    expect(coarseUrl(undefined)).toBe('')
  })
  it('caps field lengths', () => {
    const [v] = parseCspReports(legacy({ 'violated-directive': 'x'.repeat(5000), 'effective-directive': undefined }))
    expect(v.directive.length).toBeLessThanOrEqual(80)
  })
})
