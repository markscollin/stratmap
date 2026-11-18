import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart } from './helpers'

// Launch review R-45 and R-49: a reporting line can be removed from the role's edit form (no mouse), and the × on a line is
// saved (it used to disappear until the next reload).
let ctx: BrowserContext
let page: Page
let slug: string

async function addRole(p: Page, name: string, reportsTo?: string) {
  await p.getByRole('button', { name: /Add node/ }).click()
  await p.getByPlaceholder(/Sarah Chen/).fill(name)
  await p.getByPlaceholder('e.g. Senior Engineer').fill('Engineer')
  if (reportsTo) {
    await p.getByRole('button', { name: /None \(root node\)/ }).click()
    await p.getByRole('dialog').getByRole('button', { name: new RegExp(`^${reportsTo}`) }).click()
  }
  await p.getByRole('button', { name: 'Create node' }).click()
  await expect(p.getByTestId('node-card').filter({ hasText: name })).toBeVisible()
}

const chartId = (p: Page) => /\/charts\/([^/?#]+)/.exec(p.url())![1]
const headers = () => ({ 'X-Dev-User': slug })

async function serverChart() {
  const res = await ctx.request.get(`/api/charts/${chartId(page)}`, { headers: headers() })
  expect(res.ok()).toBe(true)
  return res.json() as Promise<{ nodes: { id: string; name: string }[]; edges: { id: string; sourceId: string; targetId: string }[] }>
}

test.describe.serial('deleting reporting lines', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    slug = testUser(`lines${testInfo.retry}`).slug
    ctx = await signedInContext(browser, slug)
    page = await ctx.newPage()
    await onboard(page, 'Lines Co')
    await createChart(page, 'Lines plan')
    await addRole(page, 'Alpha Boss')
    await addRole(page, 'Bravo Boss')
    await addRole(page, 'Carol Report', 'Alpha Boss')
    // A second manager for Carol (what the Connect tool draws).
    await expect.poll(async () => { const c = await serverChart(); return c.nodes.length === 3 && c.edges.length === 1 }, { timeout: 10_000 }).toBe(true)
    const { nodes } = await serverChart()
    const id = (n: string) => nodes.find(x => x.name === n)!.id
    const res = await ctx.request.post(`/api/charts/${chartId(page)}/edges`, { headers: headers(), data: { sourceId: id('Bravo Boss'), targetId: id('Carol Report') } })
    expect(res.ok()).toBe(true)
    await page.reload(); await page.waitForLoadState('networkidle')
    await expect(page.locator('path[stroke="transparent"]')).toHaveCount(2)
  })
  test.afterAll(async () => { await ctx?.close() })

  test('R-45: the edit form lists the second line and removes it with the keyboard; it stays gone after a reload', async () => {
    const carol = page.getByTestId('node-card').filter({ hasText: 'Carol Report' })
    await carol.focus()
    await page.keyboard.press('F2')
    await expect(page.getByRole('dialog')).toBeVisible()
    const dialog = page.getByRole('dialog')
    const remove = dialog.getByRole('button', { name: /^Remove reporting line: Reports to (Alpha|Bravo) Boss$/ })  // lines come back ordered by id: either manager can be the one the menu holds
    await remove.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('path[stroke="transparent"]')).toHaveCount(1)
    await expect(remove).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect.poll(async () => (await serverChart()).edges.length, { timeout: 10_000 }).toBe(1)
    await page.reload(); await page.waitForLoadState('networkidle')
    await expect(page.locator('path[stroke="transparent"]')).toHaveCount(1)
  })

  test('R-49: the × on a selected line is saved, so the line does not come back after a reload', async () => {
    await page.locator('path[stroke="transparent"]').first().dispatchEvent('click') // the thin line's box centre can sit on a card, so send the click to the line itself
    await page.getByText('×', { exact: true }).dispatchEvent('click') // bubbles to the button's group; the bubble is animated, so it never counts as stable
    await expect(page.locator('path[stroke="transparent"]')).toHaveCount(0)
    await expect.poll(async () => (await serverChart()).edges.length, { timeout: 10_000 }).toBe(0)
    await page.reload(); await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('node-card')).toHaveCount(3)
    await expect(page.locator('path[stroke="transparent"]')).toHaveCount(0)
  })
})
