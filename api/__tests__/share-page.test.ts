// Roadmap 2.5: link previews for /share/:code (served by api/share-page.ts via a vercel.json rewrite).
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import { eq } from 'drizzle-orm'
import handler from '../share-page'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, testDb, TEST_CHART_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

const CODE = 'previewcode00001'

// `code: null` sends the request with no code at all.
async function get(code: string | null = CODE, extra: { method?: string; headers?: Record<string, string> } = {}) {
  const res = createRes()
  ;(res as unknown as { send: (b: string) => MockRes }).send = (b: string) => { res._written = b; return res }
  await handler(createReq({ method: extra.method ?? 'GET', query: code === null ? {} : { code }, headers: extra.headers }) as never, res as never)
  return res
}
const html = (r: MockRes) => r._written

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  process.env.APP_URL = 'https://app.example.com'
  await cleanDb()
  await seedWorkspace()
  await seedChart()
  await seedNode()
  await testDb.update(schema.charts).set({ name: 'Q3 Hiring Plan', isPublic: true }).where(eq(schema.charts.id, TEST_CHART_ID))
  await testDb.insert(schema.sharedLinks).values({ id: CODE, chartId: TEST_CHART_ID, createdBy: 'u-test' })
})

describe('GET /api/share-page', () => {
  it('a public link previews with the chart name and role count, as a full app page', async () => {
    const res = await get()
    expect(res._status).toBe(200)
    expect(res._headers['Content-Type']).toMatch(/text\/html/)
    const page = html(res)
    expect(page).toContain('<title>Q3 Hiring Plan · StratMap</title>')
    expect(page).toContain('<meta property="og:title" content="Q3 Hiring Plan · StratMap" />')
    expect(page).toContain('Org chart with 1 role. View it on StratMap.')
    expect(page).toContain(`<meta property="og:url" content="https://app.example.com/share/${CODE}" />`)
    expect(page).toContain('<meta property="og:image" content="https://app.example.com/og-image.png" />')
    expect(page).toContain('<div id="root">')              // the React app still mounts
    expect(page).toContain('<script type="module"')         // (dist/app.html after a build, else the source index.html)
  })

  it('is never indexed and never cached', async () => {
    const res = await get()
    expect(res._headers['X-Robots-Tag']).toContain('noindex')
    expect(res._headers['Cache-Control']).toBe('no-store')
    expect(html(res)).toContain('<meta name="robots" content="noindex, nofollow" />')
    expect(html(res)).not.toContain('rel="canonical"')
  })

  it('reveals the name and count only, never people, titles or salaries', async () => {
    await testDb.update(schema.nodes).set({ name: 'Secret Person', title: 'Chief Secrets' })
    const page = html(await get())
    expect(page).not.toContain('Secret Person')
    expect(page).not.toContain('Chief Secrets')
  })

  it('escapes the chart name, so it cannot inject markup into the page', async () => {
    await testDb.update(schema.charts).set({ name: '"><script>alert(1)</script>' }).where(eq(schema.charts.id, TEST_CHART_ID))
    const page = html(await get())
    expect(page).not.toContain('<script>alert(1)')
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('private, revoked, expired and unknown links all get the identical generic preview', async () => {
    const generic = async (code: string) => html(await get(code)).replace(/\/share\/[A-Za-z0-9_-]+/g, '/share/X')

    const unknown = await generic('doesnotexist0000')

    await testDb.update(schema.charts).set({ isPublic: false }).where(eq(schema.charts.id, TEST_CHART_ID))
    const priv = await generic(CODE)

    await testDb.update(schema.charts).set({ isPublic: true }).where(eq(schema.charts.id, TEST_CHART_ID))
    await testDb.update(schema.sharedLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.sharedLinks.id, CODE))
    const expired = await generic(CODE)

    await testDb.delete(schema.sharedLinks)
    const revoked = await generic(CODE)

    expect(unknown).toContain('Shared org chart · StratMap')
    expect(unknown).not.toContain('Q3 Hiring Plan')
    expect(priv).toBe(unknown)
    expect(expired).toBe(unknown)
    expect(revoked).toBe(unknown)
  })

  it('still serves the app (generic preview) for legacy long tokens and junk codes', async () => {
    for (const code of ['x'.repeat(400), "x' OR 1=1 --", '', null]) {
      const res = await get(code)
      expect(res._status).toBe(200)
      expect(html(res)).toContain('Shared org chart · StratMap')
      expect(html(res)).toContain('<div id="root">')
    }
  })

  it('over the rate limit it still serves the app, with the generic preview and no lookup', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.77' }
    for (let i = 0; i < 120; i++) await get(CODE, { headers })
    const res = await get(CODE, { headers })
    expect(res._status).toBe(200)
    expect(html(res)).toContain('Shared org chart · StratMap')
    expect(html(res)).not.toContain('Q3 Hiring Plan')
  })

  it('rejects other methods', async () => {
    expect((await get(CODE, { method: 'POST' }))._status).toBe(405)
  })
})
