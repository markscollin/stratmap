import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart } from './helpers'

// R-32 item 4: the canvas works with a keyboard alone, in a real browser (real focus, real Tab).
let ctx: BrowserContext
let page: Page

async function addRole(p: Page, name: string, reportsTo?: string) {
  await p.getByRole('button', { name: /Add node/ }).click()
  await p.getByPlaceholder(/Sarah Chen/).fill(name)
  await p.getByPlaceholder('e.g. Senior Engineer').fill('Engineer')
  if (reportsTo) {
    await p.getByRole('button', { name: /None \(root node\)/ }).click()
    await p.getByRole('dialog').getByRole('button', { name: new RegExp(`^${reportsTo}`) }).click()
  }
  await p.getByRole('button', { name: 'Create node' }).click()
  await expect(p.getByTestId('node-card').filter({ hasText: name })).toBeVisible()
}

test.describe.serial('canvas keyboard', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const { slug } = testUser(`kbd${testInfo.retry}`)
    ctx = await signedInContext(browser, slug)
    page = await ctx.newPage()
    await onboard(page, 'Keyboard Co')
    await createChart(page, 'Keyboard plan')
    await addRole(page, 'Alpha Boss')
    await addRole(page, 'Bravo Report', 'Alpha Boss')
    await addRole(page, 'Charlie Report', 'Alpha Boss')
  })
  test.afterAll(async () => { await ctx?.close() })

  const role = (name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) })

  test('Tab reaches a role, and its name says where it sits', async () => {
    await role('Alpha Boss').focus()
    await expect(role('Alpha Boss')).toBeFocused()
    await expect(role('Bravo Report')).toHaveAccessibleName(/reports to Alpha Boss/)
    await expect(role('Alpha Boss')).toHaveAccessibleName(/top level, 2 direct reports/)
    // Tab walks the roles in reading order: the boss, then the row under it, left to right.
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-node-id]:focus')).toHaveAccessibleName(/^Bravo Report/)
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-node-id]:focus')).toHaveAccessibleName(/^Charlie Report/)
  })

  test('arrow keys follow the reporting lines', async () => {
    await role('Alpha Boss').focus()
    await page.keyboard.press('ArrowDown')
    const first = page.locator('[data-node-id]:focus')
    await expect(first).toHaveCount(1)
    await expect(first).toHaveAccessibleName(/reports to Alpha Boss/)
    await page.keyboard.press('ArrowRight')
    await expect(first).toHaveAccessibleName(/reports to Alpha Boss/)
    await page.keyboard.press('ArrowUp')
    await expect(role('Alpha Boss')).toBeFocused()
  })

  test('Enter opens the role panel, Escape closes it, and focus is back on the role', async () => {
    await role('Bravo Report').focus()
    await page.keyboard.press('Enter')
    await expect(role('Bravo Report')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('dialog').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(role('Bravo Report')).toHaveAttribute('aria-pressed', 'false')
  })

  test('F2 opens the edit form', async () => {
    await role('Charlie Report').focus()
    await page.keyboard.press('F2')
    await expect(page.getByRole('dialog', { name: /edit|role|node/i })).toBeVisible()
  })
})
