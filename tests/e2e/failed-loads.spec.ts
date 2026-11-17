import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, setPlanFor, createChart } from './helpers'

// Launch review R-46: when the dashboard figures, headcount plans or role templates cannot be loaded, the page says so with a Retry.
// It must never look empty (a blank board would invite people to add plans that already exist).
let ctx: BrowserContext
let page: Page

test.describe.serial('failed loads are not "empty"', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const u = testUser(`fl${testInfo.retry}`)
    ctx = await signedInContext(browser, u.slug)
    page = await ctx.newPage()
    await onboard(page, 'Flaky Co')
    await setPlanFor(u.slug, 'growth')
  })
  test.afterAll(async () => { await ctx?.close() })

  test('headcount: a failed load shows the error and no board; Retry brings the saved plan back', async () => {
    await page.goto('/headcount')
    await page.getByRole('button', { name: /Add hire/ }).first().click()
    await page.getByPlaceholder('Job title *').fill('Data Engineer')
    await page.getByRole('button', { name: 'Q2', exact: true }).click()
    const saved = page.waitForResponse(r => /\/api\/headcount$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
    await page.getByPlaceholder('Job title *').locator('xpath=ancestor::div[3]').getByRole('button', { name: 'Add hire' }).click()
    await saved
    await expect(page.getByText('Data Engineer').first()).toBeVisible()

    let fail = true
    await page.route('**/api/headcount', route => fail && route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue())
    await page.reload()
    await expect(page.getByTestId('load-error')).toContainText("Couldn't load your headcount plans")
    await expect(page.getByRole('button', { name: /Add hire/ })).toHaveCount(0)
    await expect(page.getByText('Data Engineer')).toHaveCount(0)

    fail = false
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByTestId('load-error')).toHaveCount(0)
    await expect(page.getByText('Data Engineer').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Add hire/ }).first()).toBeVisible()
  })

  test('dashboard: failed figures show the error, not zeros; Retry shows them', async () => {
    await page.goto('/charts')
    await createChart(page, 'Plan 2027')

    let fail = true
    await page.route('**/api/workspace/stats', route => fail
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue())
    await page.goto('/dashboard')
    await expect(page.getByTestId('load-error')).toContainText("Couldn't load your dashboard figures")
    await expect(page.getByText('Total headcount')).toHaveCount(0)

    fail = false
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByTestId('load-error')).toHaveCount(0)
    await expect(page.getByText('Total headcount')).toBeVisible()
  })

  test('roles: a failed template library shows the error, not "No role templates yet"; Retry recovers', async () => {
    let fail = true
    await page.route('**/api/templates', route => fail && route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue())
    await page.goto('/roles')
    await expect(page.getByTestId('load-error')).toContainText("Couldn't load your template library")
    await expect(page.getByText('No role templates yet')).toHaveCount(0)

    fail = false
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByTestId('load-error')).toHaveCount(0)
  })
})
