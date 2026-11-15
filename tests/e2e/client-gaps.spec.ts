import { test, expect } from '@playwright/test'
import { testUser, signedInContext, onboard } from './helpers'

// Launch review R-34: the theme survives a reload, and signing out forgets the account.
test('theme choice survives a reload', async ({ browser }, testInfo) => {
  const ctx = await signedInContext(browser, testUser(`theme${testInfo.retry}`).slug)
  const page = await ctx.newPage()
  try {
    await onboard(page, 'Theme Co')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Switch to light theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible()
    await page.getByRole('button', { name: 'Switch to dark theme' }).click()
    await page.reload()
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
  } finally { await ctx.close() }
})

test('signing out from the avatar button clears the remembered plan, usage and workspace, and never touches the theme', async ({ browser }, testInfo) => {
  const ctx = await signedInContext(browser, testUser(`signout${testInfo.retry}`).slug)
  const page = await ctx.newPage()
  // The dev-bypass app signs straight back in after sign-out and refills storage, so record what was removed instead of what is left.
  await page.addInitScript(() => {
    const w = window as unknown as { __removed: string[] }
    w.__removed = []
    const real = Storage.prototype.removeItem
    Storage.prototype.removeItem = function (key: string) { w.__removed.push(key); return real.call(this, key) }
  })
  try {
    await onboard(page, 'Signout Co')
    await page.getByRole('button', { name: 'Switch to light theme' }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('stratmap_workspace_id'))).not.toBeNull()
    await page.evaluate(() => { (window as unknown as { __removed: string[] }).__removed.length = 0 })
    await page.getByRole('button', { name: /^Sign out/ }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __removed: string[] }).__removed)).toEqual(
      expect.arrayContaining(['stratmap_plan', 'stratmap_usage', 'stratmap_workspace', 'stratmap_workspace_id']),
    )
    const removed = await page.evaluate(() => (window as unknown as { __removed: string[] }).__removed)
    expect(removed).not.toContain('stratmap_theme')
    expect(removed).not.toContain('stratmap_cookie_consent')
  } finally { await ctx.close() }
})
