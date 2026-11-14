import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart, setPlanFor } from './helpers'

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

/** Reload and wait until the plan and permissions have loaded: until then the page can briefly treat the chart as view-only (workspace still looks over its limit). */
async function reload(p: Page) {
  await p.reload()
  await p.waitForLoadState('networkidle')
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

    await reload(page)
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
    await reload(page)
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

  // ── R-02: undo and redo reach the server ─────────────────────────────────────
  // A fresh chart so the earlier tests' failures cannot leak in.
  test.describe('undo and redo are saved', () => {
    test.beforeAll(async () => {
      await setPlanFor(slug, 'growth') // the Free plan has one chart
      await page.goto('/charts')
      await createChart(page, 'Undo plan')
      await addRole(page, 'Una Keeper')
      await addRole(page, 'Uri Report', 'Una Keeper')
    })

    const roleCard = (name: string) => page.getByTestId('node-card').filter({ hasText: name })
    const settled = async (fn: (c: Awaited<ReturnType<typeof serverChart>>) => boolean) =>
      expect.poll(async () => fn(await serverChart(page)), { timeout: 10_000 }).toBe(true)
    // Waits for the "Undo"/"Redo" toast: proof the shortcut was heard. (A hard reload used to leave Ctrl+Z dead: the
    // key handler kept the view-only state the page starts in. The tests below reload before pressing, so they cover that.)
    const press = async (keys: string) => {
      const toast = page.getByText(keys.includes('Shift') ? 'Redo' : 'Undo', { exact: true })
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()) // keys go to the page, not a field
      await page.keyboard.press(keys)
      await expect(toast).toBeVisible()
      await expect(toast).toHaveCount(0, { timeout: 5000 }) // let it clear before the next press
    }

    test('delete → undo → reload shows the role again, with its comment and its line', async () => {
      const chart = await serverChart(page)
      const una = chart.nodes.find(n => n.name === 'Una Keeper')!.id
      const posted = await ctx.request.post(`/api/charts/${chartId(page)}/comments`, { headers: { 'X-Dev-User': slug }, data: { nodeId: una, body: 'Keep this discussion' } })
      expect(posted.ok()).toBe(true)

      await roleCard('Una Keeper').dblclick()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm' }).click()
      await expect(roleCard('Una Keeper')).toHaveCount(0)
      await settled(c => !c.nodes.some(n => n.id === una))

      await press('Control+z')
      await expect(roleCard('Una Keeper')).toBeVisible()
      await settled(c => c.nodes.some(n => n.id === una) && c.edges.length === 1)

      await reload(page)
      await expect(roleCard('Una Keeper')).toBeVisible()
      const comments = await (await ctx.request.get(`/api/charts/${chartId(page)}/comments?nodeId=${una}`, { headers: { 'X-Dev-User': slug } })).json()
      expect(JSON.stringify(comments)).toContain('Keep this discussion')
      expect((await serverChart(page)).edges).toHaveLength(1)
      await expect(page.getByRole('alert')).toHaveCount(0)
    })

    test('R-38: deleting a role takes its job description (salary band too); undo brings it back', async () => {
      await addRole(page, 'Jo Described')
      await settled(c => c.nodes.some(n => n.name === 'Jo Described'))
      const jo = (await serverChart(page)).nodes.find(n => n.name === 'Jo Described')!.id
      const jdUrl = `/api/charts/${chartId(page)}/jd/${jo}`
      const headers = { 'X-Dev-User': slug }
      const saved = await ctx.request.put(jdUrl, { headers, data: { responsibilities: '<p>Keep the lights on</p>', salaryBandMin: 70000, salaryBandMax: 90000, salaryCurrency: 'GBP' } })
      expect(saved.ok()).toBe(true)

      await roleCard('Jo Described').dblclick()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm' }).click()
      await expect(roleCard('Jo Described')).toHaveCount(0)
      await settled(c => !c.nodes.some(n => n.id === jo))
      // Gone from the server: the lookup now answers the empty default, and a late autosave cannot recreate it.
      expect(JSON.stringify(await (await ctx.request.get(jdUrl, { headers })).json())).not.toContain('Keep the lights on')
      expect((await ctx.request.put(jdUrl, { headers, data: { responsibilities: '<p>late</p>' } })).status()).toBe(404)

      await press('Control+z')
      await expect(roleCard('Jo Described')).toBeVisible()
      await settled(c => c.nodes.some(n => n.id === jo))
      const back = await (await ctx.request.get(jdUrl, { headers })).json()
      expect(back).toMatchObject({ responsibilities: '<p>Keep the lights on</p>', salaryBandMin: 70000, salaryBandMax: 90000, salaryCurrency: 'GBP' })
    })

    test('add → undo → reload: the role is gone; redo brings it back', async () => {
      await addRole(page, 'Vic Temporary')
      await settled(c => c.nodes.some(n => n.name === 'Vic Temporary'))
      await press('Control+z')
      await expect(roleCard('Vic Temporary')).toHaveCount(0)
      await settled(c => !c.nodes.some(n => n.name === 'Vic Temporary'))
      await reload(page)
      await expect(roleCard('Una Keeper')).toBeVisible()
      await expect(roleCard('Vic Temporary')).toHaveCount(0)

      // Redo (same page load: the history is per session, so add again first)
      await addRole(page, 'Wes Again')
      await press('Control+z')
      await settled(c => !c.nodes.some(n => n.name === 'Wes Again'))
      await press('Control+Shift+z')
      await expect(roleCard('Wes Again')).toBeVisible()
      await settled(c => c.nodes.some(n => n.name === 'Wes Again'))
      await reload(page)
      await expect(roleCard('Wes Again')).toBeVisible()
    })

    test('edit → undo → reload shows the old value', async () => {
      await roleCard('Uri Report').dblclick()
      await page.getByPlaceholder('e.g. Senior Engineer').fill('Principal Wizard')
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(roleCard('Uri Report')).toContainText('Principal Wizard')
      await settled(c => JSON.stringify(c).includes('Uri Report'))
      await press('Control+z')
      await expect(roleCard('Uri Report')).toContainText('Engineer')
      await expect.poll(async () => JSON.stringify(await serverChart(page)), { timeout: 10_000 }).not.toContain('Principal Wizard')
      await reload(page)
      await expect(roleCard('Uri Report')).toContainText('Engineer')
      await expect(roleCard('Uri Report')).not.toContainText('Principal Wizard')
    })

    test('an undo that cannot be saved shows the same error as any other edit', async () => {
      await addRole(page, 'Xan Blocked')
      await settled(c => c.nodes.some(n => n.name === 'Xan Blocked'))
      await page.route('**/api/charts/*/nodes/*', route => route.request().method() === 'DELETE' ? route.abort('failed') : route.continue())
      await press('Control+z')
      await expect(page.getByRole('alert').filter({ hasText: "Couldn't delete the role" })).toBeVisible()
      await page.unroute('**/api/charts/*/nodes/*')
    })
  })

  // ── R-11: job descriptions load and save honestly ───────────────────────────
  test.describe('job description load and save', () => {
    test.beforeAll(async () => {
      await setPlanFor(slug, 'growth') // job descriptions are a paid feature
      await page.goto('/charts')
      await createChart(page, 'JD plan')
      await addRole(page, 'Jade Describer')
    })
    const roleCard = () => page.getByTestId('node-card').filter({ hasText: 'Jade Describer' })
    const openResponsibilities = async () => {
      await roleCard().click()
      await page.getByRole('button', { name: 'Responsibilities' }).click()
    }

    test('a failed load shows an error with Retry and no editor; nothing is written; Retry opens the editor', async () => {
      await reload(page)
      let puts = 0
      await page.route('**/api/charts/*/jd/*', route => {
        if (route.request().method() === 'PUT') { puts++; return route.continue() }
        return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
      })
      await openResponsibilities()
      await expect(page.getByTestId('jd-load-error')).toBeVisible()
      await expect(page.locator('.ProseMirror')).toHaveCount(0)
      await page.unroute('**/api/charts/*/jd/*')
      await page.getByRole('button', { name: 'Retry' }).click()
      await expect(page.locator('.ProseMirror')).toBeVisible()
      expect(puts).toBe(0)
    })

    test('typed text is saved and shows Saved; a refused save shows "Couldn\'t save" and the banner, and Retry saves it', async () => {
      await reload(page)
      await openResponsibilities()
      const editor = page.locator('.ProseMirror')
      await editor.click()
      await editor.pressSequentially('Owns the platform')
      await expect(page.getByTestId('jd-save-status')).toHaveText('Saved')
      const jdUrl = async () => {
        const id = (await serverChart(page)).nodes.find(n => n.name === 'Jade Describer')!.id
        return `/api/charts/${chartId(page)}/jd/${id}`
      }
      expect(JSON.stringify(await (await ctx.request.get(await jdUrl(), { headers: { 'X-Dev-User': slug } })).json())).toContain('Owns the platform')

      await page.route('**/api/charts/*/jd/*', route => route.request().method() === 'PUT' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : route.continue())
      await editor.pressSequentially(' and the pager')
      await expect(page.getByTestId('jd-save-status')).toHaveText("Couldn't save")
      await expect(page.getByRole('alert').filter({ hasText: "Couldn't save the job description" })).toBeVisible()
      await page.unroute('**/api/charts/*/jd/*')
      await page.getByRole('button', { name: 'Retry' }).click()
      await expect(page.getByTestId('jd-save-status')).toHaveText('Saved')
      expect(JSON.stringify(await (await ctx.request.get(await jdUrl(), { headers: { 'X-Dev-User': slug } })).json())).toContain('and the pager')
    })

    test('R-12: typing a salary sends one request when the box is left, a cleared box is really cleared, min above max is refused', async () => {
      await reload(page)
      await roleCard().click()
      await page.getByRole('button', { name: 'Overview' }).click()
      const puts: string[] = []
      page.on('request', r => { if (r.method() === 'PUT' && /\/jd\//.test(r.url())) puts.push(r.postData() ?? '') })
      const min = page.getByLabel('Min'), max = page.getByLabel('Max')
      await max.fill('')
      await max.pressSequentially('150000')
      expect(puts).toHaveLength(0)                        // nothing while typing
      await min.click()                                   // leaving the box saves
      await expect.poll(() => puts.length).toBe(1)
      expect(puts[0]).toBe('{"salaryBandMax":150000}')

      await min.fill('200000')                            // above the max: refused before it is sent
      await max.click()
      await expect(page.getByRole('alert').filter({ hasText: "minimum can't be above the maximum" })).toBeVisible()
      expect(puts).toHaveLength(1)

      await min.fill('')                                  // clearing the maximum really clears it
      await max.fill('')
      await min.click()
      await expect.poll(() => puts.length).toBe(2)
      expect(puts[1]).toBe('{"salaryBandMax":null}')
      const id = (await serverChart(page)).nodes.find(n => n.name === 'Jade Describer')!.id
      const jd = await (await ctx.request.get(`/api/charts/${chartId(page)}/jd/${id}`, { headers: { 'X-Dev-User': slug } })).json() as { salaryBandMax: number | null }
      expect(jd.salaryBandMax).toBeNull()
      page.removeAllListeners('request')
    })

    test('text typed in the last second survives closing the panel', async () => {
      await reload(page)
      await openResponsibilities()
      const editor = page.locator('.ProseMirror')
      await editor.click()
      await editor.press('End')
      await editor.pressSequentially(' plus last-second words')
      await page.getByRole('button', { name: 'Close' }).first().click() // the panel closes inside the 1 s window
      const id = (await serverChart(page)).nodes.find(n => n.name === 'Jade Describer')!.id
      await expect.poll(async () => JSON.stringify(await (await ctx.request.get(`/api/charts/${chartId(page)}/jd/${id}`, { headers: { 'X-Dev-User': slug } })).json()), { timeout: 10_000 })
        .toContain('last-second words')
    })
  })
})
