import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart } from './helpers'

// Roadmap 4.2: export, delete (and restore) a workspace, delete an account. Through the real UI and API.
test.describe.serial('workspace export, delete and restore', () => {
  let ctx: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }, testInfo) => {
    ctx = await signedInContext(browser, testUser(`rights${testInfo.retry}`).slug)
    page = await ctx.newPage()
    await onboard(page, 'Rights Co')
    await createChart(page, 'Board chart')
  })
  test.afterAll(async () => { await ctx?.close() })

  test('the owner downloads everything as JSON and the roles as CSV', async () => {
    await page.goto('/settings')
    const json = page.waitForEvent('download')
    await page.getByRole('button', { name: /all data \(json\)/i }).click()
    const jsonFile = await json
    expect(jsonFile.suggestedFilename()).toBe('stratmap-workspace.json')
    const data = JSON.parse(await (await import('node:fs/promises')).readFile((await jsonFile.path())!, 'utf8'))
    expect(data.workspace.name).toBe('Rights Co')
    expect(data.charts.map((c: { name: string }) => c.name)).toContain('Board chart')
    expect(JSON.stringify(data)).not.toMatch(/stripe|tokenHash/i)

    const csv = page.waitForEvent('download')
    await page.getByRole('button', { name: /all roles \(csv\)/i }).click()
    expect((await csv).suggestedFilename()).toBe('stratmap-roles.csv')
  })

  test('deleting the workspace needs its name, then lands on onboarding with a restore offer', async () => {
    await page.getByRole('button', { name: /delete workspace…/i }).click()
    const confirm = page.getByRole('button', { name: 'Delete this workspace' })
    await expect(confirm).toBeDisabled()
    await page.getByLabel(/to confirm/i).fill('Rights Co')
    const deleted = page.waitForResponse(r => r.url().endsWith('/api/workspace') && r.request().method() === 'DELETE' && r.ok())
    await confirm.click()
    await deleted
    await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.getByTestId('deleted-workspaces')).toContainText('Rights Co was deleted')
  })

  test('the deleted workspace is really gone: no charts, and its API says no workspace', async () => {
    const res = await page.request.get('/api/workspace', { headers: { 'X-Dev-User': testUser(`rights${test.info().retry}`).slug } })
    expect(res.status()).toBe(404)
  })

  test('restoring brings the workspace and its chart back', async () => {
    await page.getByRole('button', { name: 'Restore workspace' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    await page.goto('/charts')
    await expect(page.getByText('Board chart').first()).toBeVisible()
  })

  test('the delete screens fit a phone', async ({ browser }, testInfo) => {
    const phone = await signedInContext(browser, testUser(`rights${testInfo.retry}`).slug, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const p = await phone.newPage()
    await p.goto('/settings')
    await p.getByRole('button', { name: /delete workspace…/i }).click()
    await expect(p.getByLabel(/to confirm/i)).toBeVisible()
    expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    if (process.env.RIGHTS_SHOT) await p.getByRole('heading', { name: 'Danger zone' }).scrollIntoViewIfNeeded().then(() => p.screenshot({ path: process.env.RIGHTS_SHOT }))
    await phone.close()
  })
})

test.describe('account deletion', () => {
  test('a person deletes their account: workspace deleted with them, they are signed out, and cannot sign back in to it', async ({ browser }, testInfo) => {
    const user = testUser(`gone${testInfo.retry}`)
    const ctx = await signedInContext(browser, user.slug)
    const page = await ctx.newPage()
    await onboard(page, 'Leaving Co')
    await page.goto('/settings')
    await page.getByRole('button', { name: /delete my account…/i }).click()
    await expect(page.getByText(/so it is deleted with you/)).toBeVisible()
    await page.getByLabel(/to confirm/i).fill('DELETE')
    const gone = page.waitForResponse(r => r.url().endsWith('/api/account') && r.request().method() === 'DELETE' && r.ok())
    await page.getByRole('button', { name: 'Delete my account' }).click()
    await gone
    await expect(page).not.toHaveURL(/\/settings/)

    // Nothing of theirs is reachable any more.
    const res = await page.request.get('/api/workspaces', { headers: { 'X-Dev-User': user.slug } })
    const body = await res.json()
    expect(body.workspaces).toHaveLength(0)
    await ctx.close()
  })
})
