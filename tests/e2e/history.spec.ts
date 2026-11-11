import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart, setPlanFor, inviteLinkFor } from './helpers'

// Roadmap 5: chart version history and scenarios, end to end: save a version, compare it with today, restore it, undo the
// restore, branch a scenario into a new chart, and what a viewer can and cannot do.
const WS = 'History Co'

test.describe.serial('version history', () => {
  let ownerCtx: BrowserContext, viewerCtx: BrowserContext
  let owner: Page, viewer: Page
  let ownerSlug = '', chartUrl = ''
  let viewerUser: ReturnType<typeof testUser>

  async function addRole(p: Page, name: string, title: string) {
    await p.getByRole('button', { name: /Add node/ }).click()
    await p.getByPlaceholder(/Sarah Chen/).fill(name)
    await p.getByPlaceholder('e.g. Senior Engineer').fill(title)
    const saved = p.waitForResponse(r => /\/nodes$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
    await p.getByRole('button', { name: 'Create node' }).click()
    await saved
    await expect(p.getByTestId('node-card').filter({ hasText: title })).toBeVisible()
  }
  const openHistory = async (p: Page) => { await p.getByTitle('Version history').click(); await expect(p.getByTestId('history-panel')).toBeVisible() }
  const panel = (p: Page) => p.getByTestId('history-panel')

  test.beforeAll(async ({ browser }, testInfo) => {
    const o = testUser(`hist${testInfo.retry}`)
    ownerSlug = o.slug
    viewerUser = testUser(`histv${testInfo.retry}`)
    ownerCtx = await signedInContext(browser, o.slug); owner = await ownerCtx.newPage()
    viewerCtx = await signedInContext(browser, viewerUser.slug); viewer = await viewerCtx.newPage()
    await onboard(owner, WS)
    await setPlanFor(o.slug, 'growth')
    await createChart(owner, 'Org')
    chartUrl = owner.url()
    await owner.reload()                       // the page reads the plan when it loads, and it was just changed in the database
    await addRole(owner, 'Alpha Person', 'Alpha Lead')
  })
  test.afterAll(async () => { await ownerCtx?.close(); await viewerCtx?.close() })

  test('save a named version', async () => {
    await openHistory(owner)
    await expect(panel(owner).getByText(/No versions yet/)).toBeVisible()
    await panel(owner).getByLabel('Version name').fill('Baseline')
    const saved = owner.waitForResponse(r => /\/snapshots$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
    await panel(owner).getByRole('button', { name: 'Save version' }).click()
    await saved
    const row = panel(owner).getByTestId('version-row').first()
    await expect(row).toContainText('Baseline')
    await expect(row).toContainText('1 role')
    await owner.keyboard.press('Escape')
    await panel(owner).getByRole('button', { name: 'Close' }).click()
  })

  test('add a role, then compare the baseline with today: the new role shows as added', async () => {
    await addRole(owner, 'Beta Person', 'Beta Analyst')
    await openHistory(owner)
    await panel(owner).getByRole('button', { name: /Compare with today/ }).click()
    const result = panel(owner).getByTestId('compare-result')
    await expect(result.getByTestId('diff-added')).toContainText('Beta Person, Beta Analyst')
    await expect(result.getByTestId('diff-roles')).toContainText('1 → 2 (+1)')
    await panel(owner).getByRole('button', { name: 'Close comparison' }).click()
  })

  test('restore the baseline: the canvas goes back to one role, and an automatic version was saved first', async () => {
    await panel(owner).getByRole('button', { name: /Restore/ }).first().click()
    await expect(panel(owner)).toContainText('saved first as an automatic version')
    const restored = owner.waitForResponse(r => /\/restore$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
    await panel(owner).getByRole('button', { name: 'Restore this version' }).click()
    await restored
    await expect(owner.getByTestId('history-panel')).toHaveCount(0)
    await expect(owner.getByTestId('node-card')).toHaveCount(1)
    await expect(owner.getByTestId('node-card')).toContainText('Alpha Lead')

    await openHistory(owner)
    const auto = panel(owner).getByTestId('version-row').filter({ hasText: 'Before restoring' })
    await expect(auto).toContainText('Automatic')
    await expect(auto).toContainText('2 roles')
  })

  test('undo the restore by restoring the automatic version: the second role is back', async () => {
    await panel(owner).getByTestId('version-row').filter({ hasText: 'Before restoring' }).getByRole('button', { name: /Restore/ }).click()
    const restored = owner.waitForResponse(r => /\/restore$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
    await panel(owner).getByRole('button', { name: 'Restore this version' }).click()
    await restored
    await expect(owner.getByTestId('node-card')).toHaveCount(2)
    await expect(owner.getByTestId('node-card').filter({ hasText: 'Beta Analyst' })).toBeVisible()
  })

  test('branch the baseline into a new chart (a scenario): it has one role, and the original keeps two', async () => {
    await openHistory(owner)
    await panel(owner).getByTestId('version-row').filter({ hasText: /^Baseline/ }).getByRole('button', { name: /New chart from this/ }).click()
    await panel(owner).getByLabel('New chart name').fill('Plan B')
    const created = owner.waitForResponse(r => /\/branch$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
    await panel(owner).getByRole('button', { name: 'Create chart' }).click()
    await created
    await expect(owner).not.toHaveURL(chartUrl)               // retries until the app has moved to the new chart
    await expect(owner).toHaveURL(/\/charts\/[^/]+$/)
    await expect(owner.getByTestId('node-card')).toHaveCount(1)
    await expect(owner.getByTestId('node-card')).toContainText('Alpha Lead')
    await owner.goto(chartUrl)
    await expect(owner.getByTestId('node-card')).toHaveCount(2)
  })

  test('a viewer can open the history and compare, but cannot save or restore, and the server agrees', async () => {
    const invited = await owner.request.post('/api/workspace/invites', { headers: { 'X-Dev-User': ownerSlug }, data: { invites: [{ email: viewerUser.email, permission: 'viewer' }] } })
    expect(invited.status()).toBe(201)
    await viewer.goto(await inviteLinkFor(viewerUser.email))
    await viewer.getByRole('button', { name: `Join ${WS}` }).click()
    await expect(viewer.getByRole('button', { name: 'Switch workspace' })).toContainText(WS)

    await viewer.goto(chartUrl)
    await expect(viewer.getByTestId('node-card').first()).toBeVisible()
    await openHistory(viewer)
    await expect(panel(viewer).getByTestId('version-row').filter({ hasText: /^Baseline/ })).toBeVisible()
    await expect(panel(viewer).getByLabel('Version name')).toHaveCount(0)
    await expect(panel(viewer).getByRole('button', { name: /Restore/ })).toHaveCount(0)
    await panel(viewer).getByTestId('version-row').filter({ hasText: /^Baseline/ }).getByRole('button', { name: /Compare with today/ }).click()
    await expect(panel(viewer).getByTestId('compare-result')).toContainText('Beta Person, Beta Analyst')

    const chartId = new URL(chartUrl).pathname.split('/').pop()!
    const headers = { 'X-Dev-User': viewerUser.slug }
    const list = await (await viewer.request.get(`/api/charts/${chartId}/snapshots`, { headers })).json() as { snapshots: { id: string }[] }
    expect((await viewer.request.post(`/api/charts/${chartId}/snapshots`, { headers, data: { name: 'sneaky' } })).status()).toBe(403)
    expect((await viewer.request.post(`/api/charts/${chartId}/snapshots/${list.snapshots[0].id}/restore`, { headers, data: {} })).status()).toBe(403)
  })

  test('the history fits a phone screen', async ({ browser }, testInfo) => {
    const phone = await signedInContext(browser, testUser(`histv${testInfo.retry}`).slug, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const p = await phone.newPage()
    await p.goto(chartUrl)
    await p.getByTitle('Version history').click()
    await expect(panel(p).getByTestId('version-row').first()).toBeVisible()
    expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    if (process.env.HISTORY_SHOT) await p.screenshot({ path: process.env.HISTORY_SHOT })
    await phone.close()
  })
})
