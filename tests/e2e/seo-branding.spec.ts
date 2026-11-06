import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import fs from 'node:fs'
import { testUser, signedInContext, onboard, createChart } from './helpers'

// Roadmap 2.5 + 2.6 on a Free workspace: share-link previews, the share page's "Made with StratMap",
// and the mark on PNG exports.
let ctx: BrowserContext
let page: Page
let shareUrl = ''
let code = ''
const CHART = 'Brand plan'

test.describe.serial('previews and branding (Free plan)', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    ctx = await signedInContext(browser, testUser(`brand${testInfo.retry}`).slug)
    page = await ctx.newPage()
    await onboard(page, 'Brand Co')
    await createChart(page, CHART)
    await page.getByRole('button', { name: /Add node/ }).click()
    await page.getByPlaceholder(/Sarah Chen/).fill('Secret Person')
    await page.getByPlaceholder('e.g. Senior Engineer').fill('Chief Secrets')
    await page.getByRole('button', { name: 'Create node' }).click()
    await expect(page.getByText('Secret Person').first()).toBeVisible()
  })
  test.afterAll(async () => { await ctx?.close() })

  test('a PNG export of a Free chart carries the Made with StratMap mark', async () => {
    await page.getByTitle('Export', { exact: true }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export as PNG' }).click()
    const file = test.info().outputPath('free.png')
    await (await download).saveAs(file)
    const base64 = fs.readFileSync(file).toString('base64')

    // The node sits top-left; the mark is drawn bottom-right. Count bright (text) pixels in the
    // bottom-right block: a clean export has none there.
    const bright = await page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
      const g = c.getContext('2d')!; g.drawImage(img, 0, 0)
      const x0 = Math.floor(img.width * 0.55), y0 = Math.floor(img.height * 0.6)
      const d = g.getImageData(x0, y0, img.width - x0, img.height - y0).data
      let n = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) n++
      return n
    }, base64)
    expect(bright).toBeGreaterThan(40)
  })

  test('the public share page of a Free workspace shows Made with StratMap, linking to the landing page', async ({ browser }) => {
    await page.getByTitle('Share settings').click()
    await page.getByTestId('share-toggle').click()
    const field = page.getByTestId('share-url')
    await expect(field).toBeVisible()
    shareUrl = await field.inputValue()
    code = /\/share\/([\w-]+)$/.exec(shareUrl)![1]

    const guest = await browser.newContext()
    const guestPage = await guest.newPage()
    await guestPage.goto(shareUrl)
    await expect(guestPage.getByText(CHART).first()).toBeVisible()
    await expect(guestPage.getByTestId('share-branding')).toHaveAttribute('href', '/')
    await guest.close()
  })

  test('the share link has a preview with the chart name and role count, and nothing about people', async () => {
    const res = await page.request.get(`/api/share-page?code=${code}`)
    expect(res.status()).toBe(200)
    expect(res.headers()['x-robots-tag']).toContain('noindex')
    const html = await res.text()
    expect(html).toContain(`<meta property="og:title" content="${CHART} · StratMap" />`)
    expect(html).toMatch(/Org chart with 1 role\. View it on StratMap\./)
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />')
    expect(html).toContain('<div id="root">')
    expect(html).not.toContain('Secret Person')
    expect(html).not.toContain('Chief Secrets')
  })

  test('once sharing is turned off the preview no longer mentions the chart', async () => {
    await page.getByTestId('share-toggle').click() // back to private
    await expect(page.getByTestId('share-url')).toBeHidden()
    const html = await (await page.request.get(`/api/share-page?code=${code}`)).text()
    expect(html).toContain('Shared org chart · StratMap')
    expect(html).not.toContain(CHART)
  })
})
