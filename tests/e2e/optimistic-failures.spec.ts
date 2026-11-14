import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart, setPlanFor } from './helpers'

// Launch review R-14: writes outside the canvas that fail must not leave the screen out of step with the server,
// and "could not load" must never look like "nothing here".
let ctx: BrowserContext
let page: Page
let slug: string

test.describe.serial('failed writes outside the canvas', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    slug = testUser(`opt${testInfo.retry}`).slug
    ctx = await signedInContext(browser, slug)
    page = await ctx.newPage()
    await onboard(page, 'Optimistic Co')
    await setPlanFor(slug, 'growth')
    await createChart(page, 'Keep me')
  })
  test.afterAll(async () => { await ctx?.close() })

  test('a chart list that cannot load shows an error with Retry, not "No charts yet"; Retry brings the charts back', async () => {
    await page.route('**/api/charts', route => route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue())
    await page.goto('/charts')
    await expect(page.getByTestId('load-error')).toContainText("Couldn't load your charts")
    await expect(page.getByText('No charts yet')).toHaveCount(0)
    await page.unroute('**/api/charts')
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText('Keep me').first()).toBeVisible()
    await expect(page.getByTestId('load-error')).toHaveCount(0)
  })

  test('the dashboard says so too, instead of showing zeros', async () => {
    await page.route('**/api/charts', route => route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue())
    await page.goto('/dashboard')
    await expect(page.getByTestId('load-error')).toContainText("Couldn't load your dashboard")
    await page.unroute('**/api/charts')
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByTestId('load-error')).toHaveCount(0)
  })

  test('a chart whose delete is refused comes back, with a message', async () => {
    await page.goto('/charts')
    await expect(page.getByText('Keep me').first()).toBeVisible()
    await page.route('**/api/charts/*', route => route.request().method() === 'DELETE'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue())
    await page.getByTestId('chart-overflow-btn').first().click()
    await page.getByText('Delete').first().click()
    await page.getByTestId('chart-delete-confirm').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText("Couldn't delete the chart. Please try again.")).toBeVisible()
    await expect(page.getByText('Keep me').first()).toBeVisible()
    await page.unroute('**/api/charts/*')
    // and it is really still on the server
    const list = await (await ctx.request.get('/api/charts', { headers: { 'X-Dev-User': slug } })).json() as { name: string }[]
    expect(list.map(c => c.name)).toContain('Keep me')
  })

  test('turning sharing on that the server refuses leaves the chart private, with a message', async () => {
    await page.goto('/charts')
    await page.getByText('Keep me').first().click()
    await expect(page).toHaveURL(/\/charts\/[^/]+/)
    await page.route('**/api/charts/*', route => route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue())
    await page.getByTitle('Share settings').click()
    const toggle = page.getByTestId('share-toggle')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(page.getByText("Couldn't change sharing. Please try again.")).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await page.unroute('**/api/charts/*')
  })
})
