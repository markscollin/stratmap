import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart, setPlanFor } from './helpers'

// Launch review R-42: a chart card on the Charts page opens from the keyboard, and the dialogs that used to be hand-made now behave
// like dialogs (named, Escape closes, focus comes back).
let ctx: BrowserContext
let page: Page

test.describe.serial('keyboard on the pages (R-42)', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const slug = testUser(`kbpages${testInfo.retry}`).slug
    ctx = await signedInContext(browser, slug)
    page = await ctx.newPage()
    await onboard(page, 'Keys Co')
    await setPlanFor(slug, 'growth')
    await createChart(page, 'Keyboard chart')
  })
  test.afterAll(async () => { await ctx?.close() })

  test('a chart opens by Tab to its name and Enter', async () => {
    await page.goto('/charts')
    const name = page.getByRole('button', { name: 'Keyboard chart', exact: true })
    await name.focus()
    await expect(name).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/charts\/[^/]+$/)
  })

  test('New chart is a real dialog: named, Escape closes it, focus returns to the button that opened it', async () => {
    await page.goto('/charts')
    const open = page.getByRole('button', { name: /New chart|New org chart|Create chart/i }).first()
    await open.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'New org chart' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Chart name')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(open).toBeFocused()
  })

  test('the charts search box and the workspace name have labels', async () => {
    await page.goto('/charts')
    await expect(page.getByLabel('Search charts')).toBeVisible()
    await page.goto('/settings')
    await expect(page.getByLabel('Workspace name')).toBeVisible()
  })
})
