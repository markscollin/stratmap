import { test, expect } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart } from './helpers'

// Phase 5: an embeddable read-only chart. (The framing headers live in vercel.json and only run on Vercel; they are
// covered by src/lib/__tests__/vercelRewrites.test.ts.)
test('a shared chart can be embedded: the snippet points at /embed, a signed-out visitor sees it read-only, and turning sharing off empties it', async ({ browser }) => {
  const u = testUser('embed')
  const ctx = await signedInContext(browser, u.slug)
  const page = await ctx.newPage()
  await onboard(page, 'Embed Co')
  await createChart(page, 'Public org')

  await page.getByTitle('Share settings').click()
  await page.getByTestId('share-toggle').click()
  await expect(page.getByTestId('share-url')).toBeVisible()
  const code = (await page.getByTestId('share-url').inputValue()).split('/share/')[1]

  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  await page.getByTestId('copy-embed').click()
  await expect(page.getByTestId('copy-embed')).toContainText('copied')

  const guestCtx = await browser.newContext()
  const guest = await guestCtx.newPage()
  await guest.goto(`/embed/${code}`)
  await expect(guest).toHaveTitle('Public org — StratMap')
  await expect(guest.getByTestId('embed-message')).toHaveCount(0)
  await expect(guest.getByTitle('Version history')).toHaveCount(0)
  await expect(guest.getByRole('button', { name: /Add node/ })).toHaveCount(0)

  // Turn sharing off: the same embed now says so.
  await page.getByTestId('share-toggle').click()
  await expect(page.getByTestId('share-url')).toHaveCount(0)
  await guest.reload()
  await expect(guest.getByTestId('embed-message')).toContainText('no longer shared')
  await guestCtx.close(); await ctx.close()
})
