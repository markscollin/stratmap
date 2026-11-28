import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, setPlanFor } from './helpers'

// R-78: the BambooHR dialog is reachable from a chart's import dialog and follows the plan. BambooHR itself is not reachable from
// tests, so connecting and syncing are covered by api/__tests__/hr-sync.test.ts; here the e2e server has no INTEGRATION_ENCRYPTION_KEY,
// which the dialog must say plainly instead of offering a form that cannot work.
let ctx: BrowserContext
let page: Page
let slug = ''

const csv = (...lines: string[]) => ({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n') + '\n') })

test.describe.serial('BambooHR sync dialog', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    slug = testUser(`hrsync${testInfo.retry}`).slug
    ctx = await signedInContext(browser, slug)
    page = await ctx.newPage()
    await onboard(page, 'HR Co')
    await page.goto('/charts')
    await page.getByTestId('import-btn').click()
    await page.getByRole('dialog', { name: 'Import people' }).getByTestId('import-file').setInputFiles(csv('Name,Title', 'Ada Test,CEO'))
    await page.getByRole('dialog', { name: 'Import people' }).getByRole('button', { name: 'Review' }).click()
    await page.getByRole('dialog', { name: 'Import people' }).getByRole('button', { name: 'Import 1 role' }).click()
    await expect(page).toHaveURL(/\/charts\/[^/]+$/)
  })
  test.afterAll(async () => { await ctx?.close() })

  const open = async () => {
    await page.getByTitle('Import or update from a file (CSV or Excel)').click()
    await page.getByRole('dialog', { name: 'Import people' }).getByRole('button', { name: 'Sync with BambooHR instead' }).click()
    return page.getByRole('dialog', { name: 'BambooHR sync' })
  }

  test('on Free it shows what the sync unlocks', async () => {
    const dialog = await open()
    await expect(dialog.getByTestId('locked-hr-sync')).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
  })

  test('on Growth, without the server key, it says connections are not set up', async () => {
    await setPlanFor(slug, 'growth')
    await page.reload()
    const dialog = await open()
    await expect(dialog.getByText(/not set up on this server yet/)).toBeVisible()
    await expect(dialog.getByLabel('API key')).toHaveCount(0)
  })
})
