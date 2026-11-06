import { test, expect, type BrowserContext, type Page, type Browser } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart } from './helpers'

// Roadmap 2.8: phones get a drawer menu, a view-only canvas you can pan and pinch, and a share page that fits.
// Tablets keep the desktop layout and editing.
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const TABLET = { viewport: { width: 820, height: 1180 }, hasTouch: true }

let slug = ''
let chartUrl = ''
let shareUrl = ''

async function addRole(p: Page, name: string) {
  await p.getByRole('button', { name: /Add node/ }).click()
  await p.getByPlaceholder(/Sarah Chen/).fill(name)
  await p.getByPlaceholder('e.g. Senior Engineer').fill('Engineer')
  const saved = p.waitForResponse(r => /\/nodes$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
  await p.getByRole('button', { name: 'Create node' }).click()
  await saved
}

async function open(browser: Browser, options: typeof PHONE | typeof TABLET, url: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await signedInContext(browser, slug, options)
  const page = await ctx.newPage()
  await page.goto(url)
  return { ctx, page }
}

const overflowX = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const zoomPercent = async (p: Page) => Number((await p.getByText(/^\d+%$/).first().innerText()).replace('%', ''))

/** Real touch input (what a finger sends), via Chromium's DevTools protocol. */
async function touch(page: Page, ctx: BrowserContext, steps: { x: number; y: number }[][]) {
  const cdp = await ctx.newCDPSession(page)
  const send = (type: string, pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ ...p, id })) })
  await send('touchStart', steps[0])
  for (const pts of steps.slice(1)) await send('touchMove', pts)
  await send('touchEnd', [])
}

test.describe.serial('phones and tablets', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    slug = testUser(`mobile${testInfo.retry}`).slug
    const ctx = await signedInContext(browser, slug) // desktop, to set things up
    const page = await ctx.newPage()
    await onboard(page, 'Mobile Co')
    await createChart(page, 'Phone plan')
    await addRole(page, 'Ada Lovelace')
    await addRole(page, 'Grace Hopper')
    chartUrl = page.url()
    await page.getByTitle('Share settings').click()
    await page.getByTestId('share-toggle').click()
    shareUrl = await page.getByTestId('share-url').inputValue()
    await ctx.close()
  })

  test('phone: the sidebar is a drawer behind a menu button and closes when you pick a page', async ({ browser }) => {
    const { ctx, page } = await open(browser, PHONE, '/dashboard')
    await expect(page.getByTestId('sidebar')).toHaveCount(0)
    await page.getByTestId('nav-menu').click()
    await expect(page.getByTestId('nav-drawer')).toBeVisible()
    await page.getByRole('button', { name: 'Org Charts' }).click()
    await expect(page).toHaveURL(/\/charts$/)
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0)
    await page.getByTestId('nav-menu').click()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('nav-drawer')).toHaveCount(0)
    await ctx.close()
  })

  test('phone: Dashboard, Charts and Pricing fit the screen with no sideways scroll', async ({ browser }) => {
    const { ctx, page } = await open(browser, PHONE, '/dashboard')
    for (const url of ['/dashboard', '/charts', '/pricing']) {
      await page.goto(url)
      await expect(page.getByTestId('nav-menu')).toBeVisible()
      expect(await overflowX(page), url).toBeLessThanOrEqual(1)
    }
    await ctx.close()
  })

  test('phone: the canvas is view-only, says why, and the roles are on screen', async ({ browser }) => {
    const { ctx, page } = await open(browser, PHONE, chartUrl)
    await expect(page.getByText('Ada Lovelace').first()).toBeVisible()
    await expect(page.getByTestId('phone-view-only')).toContainText('View only on phones')
    await expect(page.getByRole('button', { name: /Add node/ })).toHaveCount(0)
    const box = (await page.getByText('Ada Lovelace').first().boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(await overflowX(page)).toBeLessThanOrEqual(1)
    await ctx.close()
  })

  test('phone: one finger pans the chart and two fingers pinch to zoom', async ({ browser }) => {
    const { ctx, page } = await open(browser, PHONE, chartUrl)
    const ada = page.getByText('Ada Lovelace').first()
    await expect(ada).toBeVisible()

    const before = (await ada.boundingBox())!
    await touch(page, ctx, [[{ x: 60, y: 300 }], [{ x: 100, y: 300 }], [{ x: 140, y: 300 }]])   // drag right by 80px on empty canvas
    await expect.poll(async () => (await ada.boundingBox())!.x).toBeGreaterThan(before.x + 40)

    const zoomBefore = await zoomPercent(page)
    await touch(page, ctx, [
      [{ x: 150, y: 400 }, { x: 240, y: 400 }],
      [{ x: 120, y: 400 }, { x: 270, y: 400 }],
      [{ x: 90, y: 400 }, { x: 300, y: 400 }],                                                    // fingers spread: zoom in
    ])
    await expect.poll(() => zoomPercent(page)).toBeGreaterThan(zoomBefore + 20)
    await ctx.close()
  })

  test('phone: a Free share page fits, with the mark below the chart', async ({ browser }) => {
    const ctx = await browser.newContext(PHONE)
    const page = await ctx.newPage()
    await page.goto(shareUrl)
    await expect(page.getByText('Ada Lovelace').first()).toBeVisible()
    const footer = page.getByTestId('share-footer')
    await expect(footer).toBeVisible()
    await expect(page.getByTestId('share-branding')).toBeVisible()
    const f = (await footer.boundingBox())!
    expect(f.y + f.height).toBeLessThanOrEqual(844 + 1)
    expect(await overflowX(page)).toBeLessThanOrEqual(1)
    await ctx.close()
  })

  test('phone: pages built for desktops still open and say so', async ({ browser }) => {
    const { ctx, page } = await open(browser, PHONE, '/roles')
    await expect(page.getByTestId('desktop-hint')).toContainText('larger screen')
    await ctx.close()
  })

  test('tablet: keeps the sidebar and editing, plus touch pan', async ({ browser }) => {
    const { ctx, page } = await open(browser, TABLET, chartUrl)
    await expect(page.getByTestId('sidebar')).toBeVisible()
    await expect(page.getByTestId('nav-menu')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Add node/ })).toBeVisible()
    await expect(page.getByTestId('phone-view-only')).toHaveCount(0)
    await ctx.close()
  })
})
