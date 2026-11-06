import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart } from './helpers'

// Roadmap 2.7 on a Free workspace: empty Dashboard, opt-in sample chart, empty canvas, checklist.
let ctx: BrowserContext
let page: Page
let sampleUrl = ''

// Roles appear on the canvas immediately and are saved in the background; wait for the save so a later
// navigation can't cancel it.
async function submitRole(p: Page, name: string) {
  await p.getByPlaceholder(/Sarah Chen/).fill(name)
  await p.getByPlaceholder('e.g. Senior Engineer').fill('Engineer')
  const saved = p.waitForResponse(r => /\/nodes$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
  await p.getByRole('button', { name: 'Create node' }).click()
  await saved
  await expect(p.getByText(name).first()).toBeVisible()
}
async function addRole(p: Page, name: string) {
  await p.getByRole('button', { name: /Add node/ }).click()
  await submitRole(p, name)
}

test.describe.serial('getting started (Free plan)', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    ctx = await signedInContext(browser, testUser(`start${testInfo.retry}`).slug)
    page = await ctx.newPage()
    await onboard(page, 'Start Co')
  })
  test.afterAll(async () => { await ctx?.close() })

  test('a workspace with no chart sees three ways to start, and the checklist at 0 of 3', async () => {
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-empty')).toBeVisible()
    await expect(page.getByTestId('onboarding-checklist')).toBeVisible()
    await expect(page.getByTestId('checklist-progress')).toHaveText('0 of 3 done')
    await expect(page.getByText('Total headcount')).toHaveCount(0) // no wall of zeros
  })

  test('"Look at a sample" opens a labelled sample chart with five roles', async () => {
    await page.getByTestId('dashboard-empty-sample').click()
    await expect(page).toHaveURL(/\/charts\/[^/]+$/)
    sampleUrl = page.url()
    await expect(page.getByTestId('sample-banner')).toContainText('This is sample data')
    await expect(page.getByText('Head of Sales').first()).toBeVisible()
  })

  test('the sample is badged in the library and does not use up the Free chart slot', async () => {
    await page.goto('/charts')
    await expect(page.getByTestId('sample-badge')).toHaveText('Sample')
    await expect(page.getByText('0 of 1 chart')).toBeVisible()
    await createChart(page, 'Our real chart') // Free allows one chart of your own, in addition to the sample
  })

  test('an empty chart shows a prompt, and the first roles tick the checklist', async () => {
    await expect(page.getByTestId('empty-canvas')).toBeVisible()
    await page.getByTestId('empty-add-role').click()
    await submitRole(page, 'Ada')
    await expect(page.getByTestId('empty-canvas')).toHaveCount(0)
    await addRole(page, 'Grace')
    await addRole(page, 'Linus')

    await page.goto('/dashboard')
    await expect(page.getByTestId('checklist-progress')).toHaveText('1 of 3 done')
    await expect(page.getByTestId('checklist-chart')).toHaveAttribute('data-done', 'true')
    await expect(page.getByTestId('checklist-invite')).toHaveAttribute('data-done', 'false')
  })

  test('an admin can hide the checklist for the workspace, and it stays hidden after a reload', async () => {
    const saved = page.waitForResponse(r => r.url().endsWith('/api/workspace/onboarding') && r.request().method() === 'PUT' && r.ok())
    await page.getByTestId('checklist-dismiss').click()
    await saved
    await expect(page.getByTestId('onboarding-checklist')).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('Org Health')).toBeVisible()
    await expect(page.getByTestId('onboarding-checklist')).toHaveCount(0)
  })

  test('the sample can be deleted from its banner', async () => {
    await page.goto(sampleUrl)
    await page.getByTestId('sample-delete').click()
    await page.getByTestId('sample-delete-confirm').click()
    await expect(page).toHaveURL(/\/charts$/)
    await expect(page.getByTestId('sample-badge')).toHaveCount(0)
    await expect(page.getByText('Our real chart').first()).toBeVisible()
  })
})
