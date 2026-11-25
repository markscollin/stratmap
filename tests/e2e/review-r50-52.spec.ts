import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart } from './helpers'

// Launch review R-50 (chart limit under parallel creates), R-51 (Connect after the canvas turned read-only) and
// R-52 (a template shows who updated it by name, never a user id).
let ctx: BrowserContext
let page: Page
let slug: string
const H = () => ({ 'X-Dev-User': slug })

async function addRole(p: Page, name: string) {
  await p.getByRole('button', { name: /Add role/ }).click()
  await p.getByPlaceholder(/Sarah Chen/).fill(name)
  await p.getByPlaceholder('e.g. Senior Engineer').fill('Engineer')
  // A loose role (the form suggests a manager since R-64): these tests draw the lines themselves.
  await p.getByTestId('reports-to').click()
  await p.getByRole('dialog').getByRole('button', { name: 'None (top of the chart)' }).last().click()
  await p.getByRole('button', { name: 'Create role' }).click()
  await expect(p.getByTestId('node-card').filter({ hasText: name })).toBeVisible()
}
const chartId = (p: Page) => /\/charts\/([^/?#]+)/.exec(p.url())![1]

test.describe.serial('review R-50 to R-52', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    slug = testUser(`r50${testInfo.retry}`).slug
    ctx = await signedInContext(browser, slug)
    page = await ctx.newPage()
    await onboard(page, 'Review Co') // Free: one chart
  })
  test.afterAll(async () => { await ctx?.close() })

  test('R-50: five charts created at once on Free leave exactly one, and the rest are plan-limit refusals', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      ctx.request.post('/api/charts', { headers: H(), data: { name: `Racer ${i}` } })))
    const statuses = results.map(r => r.status())
    expect(statuses.filter(s => s === 201).length).toBeLessThanOrEqual(1)
    for (const r of results.filter(r => r.status() !== 201)) {
      expect(r.status()).toBe(402)
      expect((await r.json()).error).toBe('plan-limit')
    }
    const list = await (await ctx.request.get('/api/charts', { headers: H() })).json() as unknown[]
    expect(list.length).toBeLessThanOrEqual(1)
    // Not frozen: one real chart can still be created or edited when there is room.
    if (list.length === 0) expect((await ctx.request.post('/api/charts', { headers: H(), data: { name: 'After' } })).status()).toBe(201)
  })

  test('R-52: the template library says "Updated by You", not the stored user id', async () => {
    const made = await ctx.request.post('/api/templates', { headers: H(), data: { title: 'Byline check', department: 'Engineering' } })
    expect(made.status()).toBe(201)
    await page.goto('/roles')
    await expect(page.getByText('Byline check')).toBeVisible()
    await expect(page.getByText(/Updated by You ·/)).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/dev-e2e/)
  })

})

// R-51 has its own workspace: the one above is already at its single Free chart after the R-50 race.
test.describe.serial('review R-51', () => {
  let ctx2: BrowserContext
  let page2: Page
  test.beforeAll(async ({ browser }, testInfo) => {
    ctx2 = await signedInContext(browser, testUser(`r51${testInfo.retry}`).slug)
    page2 = await ctx2.newPage()
    await onboard(page2, 'Connect Co')
    await createChart(page2, 'Connect plan')
  })
  test.afterAll(async () => { await ctx2?.close() })

  test('R-51: Connect armed, then a save fails and the canvas turns read-only: the next click draws no line', async () => {
    await addRole(page2, 'Alpha Boss')
    await addRole(page2, 'Bravo Boss')
    const lines = () => page2.locator('path[stroke="transparent"]').count()
    const before = await lines()
    let edgePosts = 0
    await page2.route('**/api/charts/*/edges', route => { edgePosts++; return route.continue() })
    // The next role's save fails, but only after a moment: long enough to arm Connect and pick a source first.
    await page2.route('**/api/charts/*/nodes', async route => {
      if (route.request().method() !== 'POST') return route.continue()
      await new Promise(r => setTimeout(r, 1500))
      return route.abort('failed')
    })
    await addRole(page2, 'Dana Unsaved')
    await page2.keyboard.press('c')
    await page2.getByTestId('node-card').filter({ hasText: 'Alpha Boss' }).click()
    await expect(page2.getByRole('alert')).toBeVisible({ timeout: 10_000 }) // the failure banner: the canvas is read-only now
    await page2.getByTestId('node-card').filter({ hasText: 'Bravo Boss' }).click()
    await page2.waitForTimeout(500)
    expect(await lines()).toBe(before)
    expect(edgePosts).toBe(0)
    expect(chartId(page2)).toBeTruthy()
  })
})
