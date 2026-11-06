import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart, setPlanFor } from './helpers'

// Roadmap 4.4: actions show up in Settings → Activity for owners and admins, and not for anyone else.
let ctx: BrowserContext
let page: Page
const invitee = testUser('audit-invitee')

test.describe.serial('audit log', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    ctx = await signedInContext(browser, testUser(`audit${testInfo.retry}`).slug)
    page = await ctx.newPage()
    await onboard(page, 'Audit Co')
    await setPlanFor(testUser(`audit${testInfo.retry}`).slug, 'growth')
  })
  test.afterAll(async () => { await ctx?.close() })

  test('inviting someone and turning on sharing appear in Activity, in plain English', async () => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Members' }).click()
    await page.getByRole('button', { name: /Invite/ }).click()
    await page.getByPlaceholder('colleague@company.com').fill(invitee.email)
    const sent = page.waitForResponse(r => /\/api\/workspace\/invites$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await sent

    await page.goto('/charts')
    await createChart(page, 'Shared chart')
    await page.getByTitle('Share settings').click()
    const toggled = page.waitForResponse(r => /\/api\/charts\/[^/]+$/.test(r.url()) && r.request().method() === 'PUT' && r.ok())
    await page.getByTestId('share-toggle').click()
    await toggled

    await page.goto('/settings')
    await page.getByRole('button', { name: 'Activity' }).click()
    const events = page.getByTestId('audit-event')
    await expect(events.first()).toBeVisible()
    await expect(page.getByText(`invited ${invitee.email} as Editor`)).toBeVisible()
    await expect(page.getByText(/made "Shared chart" public/)).toBeVisible()
  })

  test('Growth sees what the CSV export unlocks, not a download button', async () => {
    await expect(page.getByTestId('locked-audit-export')).toBeVisible()
    await expect(page.getByRole('button', { name: /export csv/i })).toHaveCount(0)
  })

  test('the log fits a phone screen', async ({ browser }, testInfo) => {
    const phone = await signedInContext(browser, testUser(`audit${testInfo.retry}`).slug, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const p = await phone.newPage()
    await p.goto('/settings?tab=activity')
    await expect(p.getByTestId('audit-event').first()).toBeVisible()
    expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    if (process.env.AUDIT_SHOT) await p.screenshot({ path: process.env.AUDIT_SHOT })
    await phone.close()
  })
})
