import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart } from './helpers'

// Page-level smoke tests. They run as their own user in a fresh Free workspace
// with one chart, so they don't depend on whatever the shared dev workspace holds.
const user = testUser('smoke')
let ctx: BrowserContext
let page: Page

test.beforeAll(async ({ browser }) => {
  ctx = await signedInContext(browser, user.slug)
  page = await ctx.newPage()
  await onboard(page, 'Smoke Co')
  await createChart(page, 'Smoke chart')
})
test.afterAll(async () => { await ctx?.close() })

test.describe('Dashboard', () => {
  test('loads and shows all four stat cards', async () => {
    await page.goto('/dashboard')
    await expect(page.getByText('Total headcount', { exact: true })).toBeVisible()
    await expect(page.getByText('Open roles', { exact: true })).toBeVisible()
    await expect(page.getByText('Planned hires', { exact: true })).toBeVisible()
    await expect(page.getByText('Live org charts', { exact: true })).toBeVisible()
  })

  test('sidebar navigation is visible', async () => {
    await page.goto('/dashboard')
    await expect(page.getByRole('button', { name: 'Org Charts', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Roles', exact: true })).toBeVisible()
    // Headcount is a paid feature, so on Free its label carries a plan badge.
    await expect(page.getByRole('button', { name: /^Headcount/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  })
})

test.describe('Charts', () => {
  test('lists the chart and the new-chart tile', async () => {
    await page.goto('/charts')
    await expect(page.getByRole('heading', { name: 'Org Charts' })).toBeVisible()
    await expect(page.getByText('Smoke chart').first()).toBeVisible()
    await expect(page.getByText('New chart').first()).toBeVisible()
  })

  test('delete asks for confirmation and cancel keeps the chart', async () => {
    await page.goto('/charts')
    await page.locator('[data-testid="chart-overflow-btn"]').first().click()
    await page.getByText('Delete').first().click()

    const confirm = page.locator('[data-testid="chart-delete-confirm"]')
    await expect(confirm).toBeVisible()
    await expect(confirm.getByText('cannot be undone')).toBeVisible()

    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).not.toBeVisible()
    await expect(page.getByText('Smoke chart').first()).toBeVisible()
  })
})

test.describe('Settings', () => {
  test('workspace name is pre-populated', async () => {
    await page.goto('/settings')
    await expect(page.getByRole('textbox').first()).toHaveValue('Smoke Co')
  })

  test('save button is present', async () => {
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: /save/i })).toBeVisible()
  })
})

test.describe('Roles', () => {
  test('renders template library', async () => {
    await page.goto('/roles')
    await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New template' })).toBeVisible()
  })
})

test.describe('Headcount', () => {
  test('renders the page', async () => {
    await page.goto('/headcount')
    await expect(page.getByRole('heading', { name: 'Headcount' })).toBeVisible()
  })
})
