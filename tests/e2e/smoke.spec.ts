import { test, expect } from '@playwright/test'

// All tests run in dev bypass mode (VITE_CLERK_PUBLISHABLE_KEY=pk_test_placeholder)
// so no real Clerk session is needed.

test.describe('Dashboard', () => {
  test('loads and shows all four stat cards', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Total headcount', { exact: true })).toBeVisible()
    await expect(page.getByText('Open roles', { exact: true })).toBeVisible()
    await expect(page.getByText('Planned hires', { exact: true })).toBeVisible()
    await expect(page.getByText('Live org charts', { exact: true })).toBeVisible()
  })

  test('sidebar navigation is visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Org Charts', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Roles', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Headcount', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  })
})

test.describe('Charts', () => {
  test('renders chart list', async ({ page }) => {
    await page.goto('/charts')
    await expect(page.getByRole('heading', { name: 'Org Charts' })).toBeVisible()
    await expect(page.getByText('New chart').first()).toBeVisible()
  })

  test('overflow menu contains Delete option', async ({ page }) => {
    await page.goto('/charts')

    const overflowBtns = page.locator('[data-testid="chart-overflow-btn"]')
    const count = await overflowBtns.count()

    if (count === 0) {
      test.skip(true, 'No charts in workspace to test overflow menu')
    }

    await overflowBtns.first().click()
    await expect(page.getByText('Delete')).toBeVisible()
  })

  test('delete shows confirmation dialog, cancel dismisses it', async ({ page }) => {
    await page.goto('/charts')

    const overflowBtns = page.locator('[data-testid="chart-overflow-btn"]')
    const count = await overflowBtns.count()

    if (count === 0) {
      test.skip(true, 'No charts in workspace to test delete confirmation')
    }

    await overflowBtns.first().click()
    await page.getByText('Delete').first().click()

    const confirm = page.locator('[data-testid="chart-delete-confirm"]')
    await expect(confirm).toBeVisible()
    await expect(confirm.getByText('cannot be undone')).toBeVisible()

    // Cancel — don't actually delete during tests
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).not.toBeVisible()
  })
})

test.describe('Settings', () => {
  test('workspace name input is pre-populated', async ({ page }) => {
    await page.goto('/settings')
    const input = page.getByRole('textbox').first()
    await expect(input).toBeVisible()
    // Store hydrates asynchronously — wait up to 4s for the value to appear
    await expect(input).not.toHaveValue('', { timeout: 4000 })
  })

  test('save button is present', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: /save/i })).toBeVisible()
  })
})

test.describe('Roles', () => {
  test('renders template library', async ({ page }) => {
    await page.goto('/roles')
    await expect(page.getByRole('heading', { name: 'Roles' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New template' })).toBeVisible()
  })
})

test.describe('Headcount', () => {
  test('renders headcount view', async ({ page }) => {
    await page.goto('/headcount')
    await expect(page.getByRole('heading', { name: 'Headcount' })).toBeVisible()
  })
})
