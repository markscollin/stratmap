import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, setPlanFor } from './helpers'

// Roadmap 3.4: a 1,000-role chart opens fast and drags smoothly. Builds the chart through the API on an
// Enterprise workspace (the biggest plan allows 500 roles on Growth), then measures in a real browser.
// The numbers are printed so a regression is visible, and bounded generously because CI machines are slow.
const N = 1000
let slug = ''
let ctx: BrowserContext
let page: Page
let chartId = ''

/** A tidy tree: five reports per manager, laid out on a grid so no layout pass is needed. */
function tree(n: number) {
  const nodes = [] as Record<string, unknown>[]
  const edges = [] as Record<string, unknown>[]
  for (let i = 0; i < n; i++) {
    const parent = i === 0 ? null : Math.floor((i - 1) / 5)
    const depth = Math.floor(Math.log(i * 4 + 1) / Math.log(5))
    nodes.push({
      id: `p${i}`, name: `Person ${i}`, title: i === 0 ? 'CEO' : `Role ${i}`, managerId: parent === null ? null : `p${parent}`,
      status: 'active', employmentType: 'full-time', x: (i % 40) * 260, y: depth * 180 + Math.floor(i / 40) * 40,
    })
    if (parent !== null) edges.push({ id: `e${i}`, sourceId: `p${parent}`, targetId: `p${i}` })
  }
  return { nodes, edges }
}

/** Frame intervals (ms) while `act` runs, from a requestAnimationFrame loop in the page. */
async function frameTimes(p: Page, act: () => Promise<void>) {
  await p.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __run: boolean }
    w.__frames = []; w.__run = true
    let last = performance.now()
    const tick = (t: number) => { w.__frames.push(t - last); last = t; if (w.__run) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  await act()
  const frames = await p.evaluate(() => { const w = window as unknown as { __frames: number[]; __run: boolean }; w.__run = false; return w.__frames })
  const sorted = [...frames].sort((a, b) => a - b)
  const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0
  return { frames: frames.length, median: pct(0.5), p95: pct(0.95), max: sorted[sorted.length - 1] ?? 0 }
}

test.describe.serial(`${N}-role chart`, () => {
  test.setTimeout(120_000)

  test.beforeAll(async ({ browser }, testInfo) => {
    slug = testUser(`perf${testInfo.retry}`).slug
    ctx = await signedInContext(browser, slug)
    page = await ctx.newPage()
    await onboard(page, 'Perf Co')
    await setPlanFor(slug, 'enterprise')
    const { nodes, edges } = tree(N)
    const res = await page.request.post('/api/charts', {
      headers: { 'X-Dev-User': slug },
      data: { name: 'Big chart', templateNodes: nodes, templateEdges: edges, templateDepts: [] },
    })
    expect(res.status()).toBe(201)
    chartId = (await res.json()).id
  })
  test.afterAll(async () => { await ctx?.close() })

  const role = (p: Page) => p.locator('[data-testid="node-chip"], [data-testid="node-card"]')

  test('opens in under 2 seconds on a fast machine (bounded loosely for CI)', async () => {
    const t0 = Date.now()
    await page.goto(`/charts/${chartId}`)
    await expect(role(page).first()).toBeVisible({ timeout: 30_000 })
    const ms = Date.now() - t0
    await page.waitForTimeout(600) // let the fit-to-view settle
    const inDom = await role(page).count()
    console.log(`[perf] open: ${ms} ms to the first role; ${inDom} of ${N} roles in the DOM once settled`)
    expect(ms).toBeLessThan(6000)
    expect(inDom).toBeLessThanOrEqual(N)
  })

  test('dragging a role stays smooth at the fit-to-view zoom', async () => {
    const first = role(page).first()
    const box = (await first.boundingBox())!
    const stats = await frameTimes(page, async () => {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      for (let i = 1; i <= 60; i++) { await page.mouse.move(box.x + box.width / 2 + i * 3, box.y + box.height / 2 + i * 2); await page.waitForTimeout(4) }
      await page.mouse.up()
    })
    console.log(`[perf] drag (fit view): ${stats.frames} frames, median ${stats.median.toFixed(1)} ms, p95 ${stats.p95.toFixed(1)} ms, worst ${stats.max.toFixed(1)} ms`)
    expect(stats.p95).toBeLessThan(120)
  })

  test('the drag was saved: only the moved role changed on the server', async () => {
    // The bulk UPDATE runs against the real database here. Person 0 was dragged first; the rest must be where they started.
    await expect.poll(async () => {
      const chart = await (await page.request.get(`/api/charts/${chartId}`, { headers: { 'X-Dev-User': slug } })).json()
      // The server gives template roles fresh ids, so identify them by name ("Person 12").
      const moved = (chart.nodes as { name: string; x: number; y: number }[]).filter(n => {
        const i = Number(n.name.replace('Person ', ''))
        return n.x !== (i % 40) * 260 || n.y !== Math.floor(Math.log(i * 4 + 1) / Math.log(5)) * 180 + Math.floor(i / 40) * 40
      })
      return moved.map(n => n.name)
    }, { timeout: 15_000 }).toEqual(['Person 0'])
  })

  test('dragging a role stays smooth zoomed in, where only nearby roles are drawn', async () => {
    // Zoom in with the mouse wheel over empty canvas until cards (not chips) are showing.
    await page.keyboard.press('Escape')
    const view = page.viewportSize()!
    await page.mouse.move(view.width / 2, view.height / 2)
    for (let i = 0; i < 40 && (await page.locator('[data-testid="node-card"]').count()) === 0; i++) {
      await page.mouse.wheel(0, -200)
      await page.waitForTimeout(40)
    }
    const cards = page.locator('[data-testid="node-card"]')
    expect(await cards.count()).toBeGreaterThan(0)
    expect(await cards.count()).toBeLessThan(N / 2) // far fewer than all of them
    const box = (await cards.first().boundingBox())!
    const stats = await frameTimes(page, async () => {
      await page.mouse.move(box.x + 20, box.y + 20)
      await page.mouse.down()
      for (let i = 1; i <= 60; i++) { await page.mouse.move(box.x + 20 + i * 3, box.y + 20 + i * 2); await page.waitForTimeout(4) }
      await page.mouse.up()
    })
    console.log(`[perf] drag (zoomed in): ${stats.frames} frames, median ${stats.median.toFixed(1)} ms, p95 ${stats.p95.toFixed(1)} ms, worst ${stats.max.toFixed(1)} ms; ${await cards.count()} cards drawn`)
    expect(stats.p95).toBeLessThan(120)
  })
})
