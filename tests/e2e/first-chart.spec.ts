import { test, expect, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart } from './helpers'

// R-64: the first minutes on a new chart. The header never sits under the toolbar, roles land under their manager
// without touching the form, and a small chart is readable.
async function addRoleAsSuggested(p: Page, name: string, title: string) {
  await p.getByRole('button', { name: /^Add role$/ }).click()
  await p.getByPlaceholder(/Sarah Chen/).fill(name)
  await p.getByPlaceholder('e.g. Senior Engineer').fill(title)
  const saved = p.waitForResponse(r => /\/nodes$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
  await p.getByRole('button', { name: 'Create role' }).click()
  await saved
}
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test('a first chart: no overlap at 1280 and 1366, reports-to suggested, readable zoom', async ({ browser }) => {
  const u = testUser('first-chart')
  const ctx = await signedInContext(browser, u.slug, { viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await onboard(page, 'First Co')
  await createChart(page, 'A rather long chart name for our 2026 organisation plan')

  await addRoleAsSuggested(page, 'Ada Lovelace', 'CEO')
  await addRoleAsSuggested(page, 'Bo Chen', 'CTO')
  await addRoleAsSuggested(page, 'Cy Diaz', 'Head of People')
  // both later roles report to the CEO, without anyone picking her
  await expect(page.getByRole('button', { name: /^Bo Chen, CTO, reports to Ada Lovelace/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Cy Diaz, Head of People, reports to Ada Lovelace/ })).toBeVisible()

  await page.getByRole('button', { name: 'Fit to view' }).click()
  await expect(page.getByText(/^(8\d|9\d|100)%$/)).toBeVisible() // a three-role chart is not shrunk to fit

  for (const width of [1280, 1366]) {
    await page.setViewportSize({ width, height: 800 })
    const name = await page.getByTestId('canvas-chart-name').boundingBox()
    const bar = await page.getByTestId('canvas-toolbar').boundingBox()
    expect(name && bar && !overlap(name, bar), `header and toolbar overlap at ${width}px`).toBe(true)
  }
  await ctx.close()
})
