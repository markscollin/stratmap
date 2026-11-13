import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart } from './helpers'

// Launch review R-03 and R-01: a reporting line drawn this session can be deleted before any reload, and a
// canvas change that cannot be saved says so instead of vanishing on the next reload.
let ctx: BrowserContext
let page: Page
let slug: string

async function addRole(p: Page, name: string, reportsTo?: string) {
  await p.getByRole('button', { name: /Add node/ }).click()
  await p.getByPlaceholder(/Sarah Chen/).fill(name)
  await p.getByPlaceholder('e.g. Senior Engineer').fill('Engineer')
  if (reportsTo) {
    await p.getByRole('button', { name: /None \(root node\)/ }).click()
    await p.getByRole('button', { name: new RegExp(`^${reportsTo}`) }).click()
  }
  await p.getByRole('button', { name: 'Create node' }).click()
  await expect(p.getByTestId('node-card').filter({ hasText: name })).toBeVisible()
}

const chartId = (p: Page) => /\/charts\/([^/?#]+)/.exec(p.url())![1]

async function serverChart(p: Page) {
  const res = await ctx.request.get(`/api/charts/${chartId(p)}`, { headers: { 'X-Dev-User': slug } })
  expect(res.ok()).toBe(true)
  return res.json() as Promise<{ nodes: { id: string; name: string; x: number; y: number }[]; edges: { sourceId: string; targetId: string }[] }>
}

test.describe.serial('canvas saves', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    slug = testUser(`saves${testInfo.retry}`).slug
    ctx = await signedInContext(browser, slug)
    page = await ctx.newPage()
    await onboard(page, 'Saves Co')
    await createChart(page, 'Saves plan')
  })
  test.afterAll(async () => { await ctx?.close() })

  test('R-03: a role added under A and re-parented to B, then reloaded, has exactly one line (to B)', async () => {
    await addRole(page, 'Alpha Boss')
    await addRole(page, 'Bravo Boss')
    await addRole(page, 'Carol Report', 'Alpha Boss')

    // Same session, no reload: change who Carol reports to.
    await page.getByTestId('node-card').filter({ hasText: 'Carol Report' }).dblclick()
    await page.getByRole('button', { name: /Alpha Boss/ }).click()
    await page.getByRole('button', { name: /^Bravo Boss/ }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    // Let the queued writes land (a person cannot reload within milliseconds), then prove it from a fresh page load.
    await expect.poll(async () => {
      const c = await serverChart(page)
      const bravo = c.nodes.find(n => n.name === 'Bravo Boss')?.id
      return c.edges.length === 1 && c.edges[0].sourceId === bravo
    }, { timeout: 10_000 }).toBe(true)

    await page.reload()
    await expect(page.getByTestId('node-card').filter({ hasText: 'Carol Report' })).toBeVisible()
    const { nodes, edges } = await serverChart(page)
    const id = (n: string) => nodes.find(x => x.name === n)!.id
    const intoCarol = edges.filter(e => e.targetId === id('Carol Report'))
    expect(intoCarol).toHaveLength(1)
    expect(intoCarol[0].sourceId).toBe(id('Bravo Boss'))
  })

  test('R-01: a role that cannot be saved shows the error, pauses editing, and Retry saves it', async () => {
    await page.route('**/api/charts/*/nodes', route => route.request().method() === 'POST' ? route.abort('failed') : route.continue())
    await addRole(page, 'Dana Unsaved')
    const alert = page.getByRole('alert').filter({ hasText: "Couldn't save the new role" })
    await expect(alert).toBeVisible()
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Add node/ })).toHaveCount(0) // editing is paused

    await page.unroute('**/api/charts/*/nodes')
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(alert).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Add node/ })).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('node-card').filter({ hasText: 'Dana Unsaved' })).toBeVisible()
  })

  test('R-01: a refusal that a retry cannot fix shows the server message; Reload discards the change', async () => {
    await page.route('**/api/charts/*/nodes', route => route.request().method() === 'POST'
      ? route.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ error: 'plan-limit', limit: 'nodes', max: 5, message: 'Your plan allows 5 roles per chart.' }) })
      : route.continue())
    await addRole(page, 'Eve Refused')
    const alert = page.getByRole('alert').filter({ hasText: 'Your plan allows 5 roles per chart.' })
    await expect(alert).toBeVisible()
    await expect(alert.getByRole('button', { name: 'Retry' })).toHaveCount(0)

    await page.unroute('**/api/charts/*/nodes')
    await alert.getByRole('button', { name: 'Reload' }).click()
    await expect(alert).toHaveCount(0)
    await expect(page.getByTestId('node-card').filter({ hasText: 'Eve Refused' })).toHaveCount(0)
    await expect(page.getByTestId('node-card').filter({ hasText: 'Dana Unsaved' })).toBeVisible()
  })

  test('R-01: a drag that cannot be saved shows the error', async () => {
    await page.route('**/api/charts/*/nodes', route => route.request().method() === 'PUT' ? route.abort('failed') : route.continue())
    const card = page.getByTestId('node-card').filter({ hasText: 'Alpha Boss' })
    const box = (await card.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 6 })
    await page.mouse.up()
    await expect(page.getByRole('alert').filter({ hasText: "Couldn't save the new position" })).toBeVisible()
    await page.unroute('**/api/charts/*/nodes')
  })
})
