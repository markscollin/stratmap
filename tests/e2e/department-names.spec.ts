import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard } from './helpers'

// Launch review R-47: a role on a chart made from a template shows its department's name (the template's own department),
// never a raw id, in the role panel and in the edit form.
let ctx: BrowserContext
let page: Page

test.describe.serial('department names on a template chart', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const u = testUser(`dn${testInfo.retry}`)
    ctx = await signedInContext(browser, u.slug)
    page = await ctx.newPage()
    await onboard(page, 'Names Co')
    await page.getByText('New chart').first().click()
    await page.getByPlaceholder(/Q3 Hiring Plan/).fill('Company plan')
    await page.getByText('Scale-up', { exact: true }).click()
    await page.getByRole('button', { name: 'Create chart' }).click()
    await expect(page).toHaveURL(/\/charts\/[^/]+/)
    await expect(page.getByTestId('node-card').first()).toBeVisible()
  })
  test.afterAll(async () => { await ctx?.close() })

  test('the role panel names the department and shows no id', async () => {
    await page.getByTestId('node-card').filter({ hasText: 'Chief Executive Officer' }).first().click()
    await expect(page.getByText('Leadership', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/)).toHaveCount(0)
  })

  test('the edit form shows the department, not "Select department"', async () => {
    await page.getByRole('button', { name: 'Edit role' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: /Leadership/ })).toBeVisible()
    await expect(dialog.getByText('Select department')).toHaveCount(0)
  })
})
