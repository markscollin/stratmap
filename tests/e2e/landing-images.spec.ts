import { test, expect } from '@playwright/test'
import { testUser, signedInContext, onboard, setPlanFor } from './helpers'
import { buildChartTemplate } from '../../src/lib/chartTemplates'

// Not a test: makes the landing page's hero pictures (R-62) from the real app, so they always look like the product.
//   npm run make:landing-images
// Skipped in every normal run. It builds the Scale-up template with made-up first names (the page labels it "Example chart"),
// shares it, and screenshots the read-only /embed view in dark and light into public/landing/.
const NAMES = ['Maya Okafor', 'Daniel Reyes', 'Priya Nair', 'Tom Becker', 'Hannah Lee', 'Sam Patel', 'Ines Duarte', '',
  'Leo Martin', '', 'Chloe Adams', 'Omar Haddad', '']

test.skip(!process.env.MAKE_LANDING_IMAGES, 'only with MAKE_LANDING_IMAGES=1 (npm run make:landing-images)')

test('landing page pictures', async ({ browser }) => {
  test.setTimeout(120_000)
  const u = testUser('landing')
  const ctx = await signedInContext(browser, u.slug)
  const page = await ctx.newPage()
  await onboard(page, 'Example Co')
  await setPlanFor(u.slug, 'growth') // no "Made with StratMap" pill in the picture
  const headers = { 'X-Dev-User': u.slug }

  const { nodes, edges, departments } = buildChartTemplate('scaleup')
  // An open or planned role keeps its title as its name, as the app does; everyone else gets a made-up name.
  const templateNodes = nodes.map((n, i) => ({ ...n, name: NAMES[i] || n.title }))
  const created = await page.request.post('/api/charts', { headers, data: { name: 'Example chart', templateNodes, templateEdges: edges, templateDepts: departments } })
  expect(created.ok()).toBeTruthy()
  const chartId = (await created.json() as { id: string }).id
  expect((await page.request.put(`/api/charts/${chartId}`, { headers, data: { isPublic: true } })).ok()).toBeTruthy()
  const { code } = await (await page.request.post(`/api/charts/${chartId}/share`, { headers })).json() as { code: string }

  const guest = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1.5 })
  for (const theme of ['dark', 'light'] as const) {
    await guest.goto(`/embed/${code}?theme=${theme}`)
    await expect(guest.getByText('Maya Okafor').first()).toBeVisible()
    await guest.waitForTimeout(800) // fit-to-view settles
    // The canvas controls are not part of the picture (the same elements exports leave out), and it is cropped to the chart.
    await guest.addStyleTag({ content: '[data-export-ignore] { visibility: hidden !important }' })
    const boxes = (await Promise.all((await guest.getByTestId('node-card').all()).map(c => c.boundingBox()))).filter(b => b !== null)
    const pad = 28
    const x = Math.max(0, Math.min(...boxes.map(b => b.x)) - pad), y = Math.max(0, Math.min(...boxes.map(b => b.y)) - pad)
    const right = Math.max(...boxes.map(b => b.x + b.width)) + pad, bottom = Math.max(...boxes.map(b => b.y + b.height)) + pad
    await guest.screenshot({ path: `public/landing/chart-${theme}.png`, clip: { x, y, width: right - x, height: bottom - y } })
  }
  await guest.close()
  await ctx.close()
})
