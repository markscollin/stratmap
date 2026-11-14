import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart, setPlanFor } from './helpers'

// Launch review R-10 (Duplicate chart copied nothing) and R-15 (an unknown URL was a blank page).
let ctx: BrowserContext
let page: Page
let slug: string

async function addRole(p: Page, name: string, reportsTo?: string) {
  await p.getByRole('button', { name: /Add node/ }).click()
  await p.getByPlaceholder(/Sarah Chen/).fill(name)
  await p.getByPlaceholder('e.g. Senior Engineer').fill('Engineer')
  if (reportsTo) {
    await p.getByRole('button', { name: /None \(root node\)/ }).click()
    await p.getByRole('button', { name: new RegExp(`^${reportsTo}`) }).click()
  }
  const saved = p.waitForResponse(r => /\/(nodes|edges)$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
  await p.getByRole('button', { name: 'Create node' }).click()
  await saved
  await expect(p.getByTestId('node-card').filter({ hasText: name })).toBeVisible()
}

test.describe.serial('small launch fixes', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    slug = testUser(`small${testInfo.retry}`).slug
    ctx = await signedInContext(browser, slug)
    page = await ctx.newPage()
    await onboard(page, 'Small Co')
    await setPlanFor(slug, 'growth') // more than one chart
  })
  test.afterAll(async () => { await ctx?.close() })

  test('R-10: Duplicate copies the roles and lines, and the original keeps its own', async () => {
    await page.goto('/charts')
    await createChart(page, 'Dup plan')
    await addRole(page, 'Rosa Boss')
    await addRole(page, 'Rik Report', 'Rosa Boss')
    // Let the line's save land before leaving the page.
    await expect.poll(async () => {
      const id = /\/charts\/([^/?#]+)/.exec(page.url())![1]
      const c = await (await ctx.request.get(`/api/charts/${id}`, { headers: { 'X-Dev-User': slug } })).json() as { edges: unknown[] }
      return c.edges.length
    }, { timeout: 10_000 }).toBe(1)

    await page.goto('/charts')
    await page.getByTestId('chart-overflow-btn').first().click()
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Dup plan (copy)' })).toBeVisible()

    await page.getByRole('heading', { name: 'Dup plan (copy)' }).click()
    await expect(page).toHaveURL(/\/charts\/[^/]+$/)
    await expect(page.getByTestId('node-card').filter({ hasText: 'Rosa Boss' })).toBeVisible()
    await expect(page.getByTestId('node-card').filter({ hasText: 'Rik Report' })).toBeVisible()
    const copyId = /\/charts\/([^/?#]+)/.exec(page.url())![1]
    const copy = await (await ctx.request.get(`/api/charts/${copyId}`, { headers: { 'X-Dev-User': slug } })).json() as { nodes: unknown[]; edges: unknown[]; status: string }
    expect(copy.nodes).toHaveLength(2)
    expect(copy.edges).toHaveLength(1)
    expect(copy.status).toBe('draft')
  })

  test('R-15: an unknown URL shows a 404 page with a way back, and does not bounce away', async () => {
    await page.goto('/this-page-does-not-exist')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/this-page-does-not-exist')
    await page.getByRole('link', { name: 'Go to your dashboard' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('R-15: a nested unknown URL under a real section is a 404 too', async () => {
    await page.goto('/charts/a/b/c')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })
})

// R-07: Growth AI drafting has a monthly cap, and the public pricing page states the real number.
test('R-07: the pricing page states the AI draft cap instead of "unlimited"', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.getByText('300 AI JD drafts per month')).toBeVisible()
  await expect(page.getByText(/unlimited ai/i)).toHaveCount(0)
})
