import { test, expect } from '@playwright/test'

// Roadmap 3.9: the uptime monitors' endpoint, against the real database, with no sign-in.
test('GET /api/health is 200 with a working database and needs no sign-in', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  expect(res.headers()['cache-control']).toBe('no-store')
  expect(await res.json()).toMatchObject({ status: 'ok', checks: { database: 'ok' } })
})

test('HEAD /api/health works too', async ({ request }) => {
  expect((await request.head('/api/health')).status()).toBe(200)
})
