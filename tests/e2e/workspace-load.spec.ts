import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard } from './helpers'

// Launch review R-13: when /api/workspace fails, a person who already has a workspace must not be sent to onboarding
// (where they would be asked to create one), and no page may render with the placeholder viewer permission.
let ctx: BrowserContext
let page: Page

test.describe.serial('workspace load', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const u = testUser(`wsl${testInfo.retry}`)
    ctx = await signedInContext(browser, u.slug)
    page = await ctx.newPage()
    await onboard(page, 'Load Co')
  })
  test.afterAll(async () => { await ctx?.close() })

  test('a failing workspace load shows "Couldn\'t load your workspace" with Retry, never onboarding; Retry recovers', async () => {
    let fail = true
    await page.route('**/api/workspace', route => fail && route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue())
    await page.goto('/dashboard')
    await expect(page.getByTestId('workspace-load-failed')).toBeVisible({ timeout: 15_000 }) // after two quiet retries
    expect(page.url()).not.toContain('/onboarding')
    await expect(page.getByText('Set up your workspace')).toHaveCount(0)

    fail = false
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByTestId('workspace-load-failed')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /Welcome to StratMap|Dashboard/ }).first()).toBeVisible()
    expect(page.url()).not.toContain('/onboarding')
  })

  test('one blip is retried quietly: the person sees the app, not an error', async () => {
    let calls = 0
    await page.route('**/api/workspace', route => {
      if (route.request().method() === 'GET' && calls++ === 0) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"blip"}' })
      return route.continue()
    })
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: /Welcome to StratMap|Dashboard/ }).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('workspace-load-failed')).toHaveCount(0)
    expect(calls).toBeGreaterThanOrEqual(2)
  })
})
