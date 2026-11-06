import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart } from './helpers'

// Roadmap 2.4: two tabs open on one chart. A role added in tab A makes tab B's copy stale;
// B's next edit is refused, B shows the banner and goes read-only, and Reload brings B up to date.
let ctx: BrowserContext
let a: Page
let b: Page

async function addRole(page: Page, name: string) {
  await page.getByRole('button', { name: /Add node/ }).click()
  await page.getByPlaceholder(/Sarah Chen/).fill(name)
  await page.getByPlaceholder('e.g. Senior Engineer').fill('Engineer')
  await page.getByRole('button', { name: 'Create node' }).click()
}

test.describe.serial('edit conflicts', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    ctx = await signedInContext(browser, testUser(`conflict${testInfo.retry}`).slug)
    a = await ctx.newPage()
    await onboard(a, 'Conflict Co')
    await createChart(a, 'Shared plan')
    b = await ctx.newPage()
    await b.goto(a.url())
    await expect(b.getByText('Shared plan').first()).toBeVisible()
  })
  test.afterAll(async () => { await ctx?.close() })

  test('a stale tab is refused, shows the banner, and Reload catches it up', async () => {
    await addRole(a, 'Ada Lovelace')
    await expect(a.getByText('Ada Lovelace').first()).toBeVisible()
    await expect(a.getByRole('alert').filter({ hasText: 'changed elsewhere' })).toHaveCount(0)

    await addRole(b, 'Grace Hopper') // B still has the revision from before A's edit
    const banner = b.getByRole('alert').filter({ hasText: 'changed elsewhere' })
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('not saved')

    await banner.getByRole('button', { name: 'Reload' }).click()
    await expect(banner).toHaveCount(0)
    await expect(b.getByText('Ada Lovelace').first()).toBeVisible() // A's role arrived
    await expect(b.getByText('Grace Hopper')).toHaveCount(0)       // B's refused edit did not

    await addRole(b, 'Grace Hopper') // up to date again: this one is saved
    await expect(b.getByText('Grace Hopper').first()).toBeVisible()
    await expect(banner).toHaveCount(0)
  })
})
