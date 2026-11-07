import fs from 'node:fs'
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, createChart, inviteLinkFor } from './helpers'

// Roadmap 5: comments on roles, end to end with three people (owner, commenter, viewer): threads, @mentions, the emailed
// link, the badge on the role card, resolve, the viewer being read-only, and the email switch in Settings.
const WS = 'Talk Co'
const ROLE = 'Head of Data'

function mailsTo(email: string): { subject: string; html: string }[] {
  const file = process.env.E2E_EMAIL_OUTBOX!
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { to: string; subject: string; html: string })
    .filter(m => m.to === email && /mentioned you|replied to your/.test(m.subject))
}

test.describe.serial('comments', () => {
  let ownerCtx: BrowserContext, commenterCtx: BrowserContext, viewerCtx: BrowserContext
  let owner: Page, commenter: Page, viewer: Page
  let ownerSlug = ''
  let chartUrl = ''
  const run = test.info
  let commenterUser: ReturnType<typeof testUser>, viewerUser: ReturnType<typeof testUser>

  async function selectRole(p: Page) {
    await p.getByTestId('node-card').filter({ hasText: ROLE }).first().click()
    await expect(p.getByRole('button', { name: /^Comments/ })).toBeVisible()
  }
  const openComments = async (p: Page) => { await p.getByRole('button', { name: /^Comments/ }).click(); await expect(p.getByTestId('comments-tab')).toBeVisible() }

  test.beforeAll(async ({ browser }, testInfo) => {
    const o = testUser(`talk${testInfo.retry}`)
    ownerSlug = o.slug
    commenterUser = testUser(`talkc${testInfo.retry}`)
    viewerUser = testUser(`talkv${testInfo.retry}`)
    ownerCtx = await signedInContext(browser, o.slug); owner = await ownerCtx.newPage()
    commenterCtx = await signedInContext(browser, commenterUser.slug); commenter = await commenterCtx.newPage()
    viewerCtx = await signedInContext(browser, viewerUser.slug); viewer = await viewerCtx.newPage()
    await onboard(owner, WS)
    await createChart(owner, 'Org')
    chartUrl = owner.url()
    await owner.getByRole('button', { name: /Add node/ }).click()
    await owner.getByPlaceholder(/Sarah Chen/).fill('Dana Data')
    await owner.getByPlaceholder('e.g. Senior Engineer').fill(ROLE)
    const saved = owner.waitForResponse(r => /\/nodes$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
    await owner.getByRole('button', { name: 'Create node' }).click()
    await saved
    void run
  })
  test.afterAll(async () => { await ownerCtx?.close(); await commenterCtx?.close(); await viewerCtx?.close() })

  test('invite a commenter and a viewer, and they join', async () => {
    const res = await owner.request.post('/api/workspace/invites', {
      headers: { 'X-Dev-User': ownerSlug },
      data: { invites: [{ email: commenterUser.email, permission: 'commenter' }, { email: viewerUser.email, permission: 'viewer' }] },
    })
    expect(res.status()).toBe(201)
    for (const [page, user] of [[commenter, commenterUser], [viewer, viewerUser]] as const) {
      await page.goto(await inviteLinkFor(user.email))
      await page.getByRole('button', { name: `Join ${WS}` }).click()
      await expect(page.getByRole('button', { name: 'Switch workspace' })).toContainText(WS)
    }
    await owner.reload()                                  // so the owner's member list (for @mentions) includes them
  })

  test('the owner starts a discussion on a role and mentions the commenter', async () => {
    await owner.goto(chartUrl)
    await selectRole(owner)
    await openComments(owner)
    await owner.getByLabel('Add a comment about this role').fill('@' + commenterUser.slug.slice(0, 10))
    await owner.getByTestId('mention-option').first().click()
    await owner.getByLabel('Add a comment about this role').pressSequentially('can you check the level of this role?')
    const posted = owner.waitForResponse(r => /\/comments$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
    await owner.getByRole('button', { name: 'Comment', exact: true }).click()
    await posted
    await expect(owner.getByTestId('comment').first()).toContainText('can you check the level')
    await expect(owner.getByTestId('comment-badge').first()).toHaveText('1')
  })

  test('the mention was emailed once, with the text and a link that opens the discussion', async () => {
    await expect.poll(() => mailsTo(commenterUser.email).length).toBe(1)
    const [mail] = mailsTo(commenterUser.email)
    expect(mail.subject).toContain('mentioned you')
    expect(mail.html).toContain('can you check the level of this role?')
    const link = /https?:\/\/[^"\s<]*\/charts\/[^"\s<]+/.exec(mail.html)![0].replace(/&amp;/g, '&')
    expect(link).toContain('role=')
    expect(link).toContain('tab=comments')

    // following the link lands on the chart with the role selected and its comments open
    await commenter.goto(new URL(link).pathname + new URL(link).search)
    await expect(commenter.getByTestId('comments-tab')).toBeVisible()
    await expect(commenter.getByTestId('comment').first()).toContainText('can you check the level')
  })

  test('the commenter replies, then resolves the thread; the badge goes away', async () => {
    await commenter.getByRole('button', { name: 'Reply' }).click()
    await commenter.getByLabel('Write a reply').fill('Looks right to me.')
    const replied = commenter.waitForResponse(r => /\/comments$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
    await commenter.getByTestId('comment-composer').filter({ has: commenter.getByLabel('Write a reply') }).getByRole('button', { name: 'Reply' }).click()
    await replied
    await expect(commenter.getByTestId('comment-thread')).toContainText('Looks right to me.')
    // the owner is told about the reply
    await expect.poll(() => mailsTo(`${ownerSlug}@e2e.test`).length).toBe(1)
    expect(mailsTo(`${ownerSlug}@e2e.test`)[0].subject).toContain('replied to your comment')

    const resolved = commenter.waitForResponse(r => /\/comments\/[^/]+$/.test(r.url()) && r.request().method() === 'PUT' && r.ok())
    await commenter.getByRole('button', { name: 'Resolve' }).click()
    await resolved
    await expect(commenter.getByRole('button', { name: /Show 1 resolved thread/ })).toBeVisible()
    await expect(commenter.getByTestId('comment-badge')).toHaveCount(0)

    await owner.reload()
    await expect(owner.getByTestId('comment-badge')).toHaveCount(0)
  })

  test('the viewer can read the discussion but not write, and the server agrees', async () => {
    await viewer.goto(chartUrl)
    await selectRole(viewer)
    await openComments(viewer)
    await viewer.getByRole('button', { name: /Show 1 resolved thread/ }).click()
    await expect(viewer.getByTestId('comment').first()).toContainText('can you check the level')
    await expect(viewer.getByText(/Viewers can read comments but not write them/)).toBeVisible()
    await expect(viewer.getByLabel('Add a comment about this role')).toHaveCount(0)

    const chartId = new URL(chartUrl).pathname.split('/').pop()!
    const nodes = await (await viewer.request.get(`/api/charts/${chartId}`, { headers: { 'X-Dev-User': viewerUser.slug } })).json() as { nodes: { id: string }[] }
    const refused = await viewer.request.post(`/api/charts/${chartId}/comments`, { headers: { 'X-Dev-User': viewerUser.slug }, data: { nodeId: nodes.nodes[0].id, body: 'sneaky' } })
    expect(refused.status()).toBe(403)
  })

  test('switching comment emails off in Settings stops them, and the choice is remembered', async () => {
    await commenter.goto('/settings?tab=notifications')
    const sw = commenter.getByRole('switch', { name: 'New comments' })
    await expect(sw).toBeEnabled()
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    const saved = commenter.waitForResponse(r => /\/api\/notifications$/.test(r.url()) && r.request().method() === 'PUT' && r.ok())
    await sw.click()
    await saved
    await commenter.reload()
    await expect(commenter.getByRole('switch', { name: 'New comments' })).toHaveAttribute('aria-checked', 'false')

    // the owner mentions the commenter again: they still see it in the app, but no new email goes out
    const before = mailsTo(commenterUser.email).length
    await owner.goto(chartUrl)
    await selectRole(owner)
    await openComments(owner)
    await owner.getByLabel('Add a comment about this role').fill('@' + commenterUser.slug.slice(0, 10))
    await owner.getByTestId('mention-option').first().click()
    await owner.getByLabel('Add a comment about this role').pressSequentially('one more thing')
    const posted = owner.waitForResponse(r => /\/comments$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
    await owner.getByRole('button', { name: 'Comment', exact: true }).click()
    await posted
    await new Promise(r => setTimeout(r, 1000))
    expect(mailsTo(commenterUser.email).length).toBe(before)
    await commenter.goto(chartUrl)
    await expect(commenter.getByTestId('comment-badge').first()).toHaveText('1')
  })

  test('the discussion fits a phone screen', async ({ browser }, testInfo) => {
    const phone = await signedInContext(browser, testUser(`talkc${testInfo.retry}`).slug, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const p = await phone.newPage()
    await p.goto(`${new URL(chartUrl).pathname}?role=${await roleId(owner)}&tab=comments`)
    await expect(p.getByTestId('comments-tab')).toBeVisible()
    await expect(p.getByTestId('comment').first()).toBeVisible()
    expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    if (process.env.COMMENTS_SHOT) await p.screenshot({ path: process.env.COMMENTS_SHOT })
    await phone.close()
  })

  async function roleId(p: Page): Promise<string> {
    const chartId = new URL(chartUrl).pathname.split('/').pop()!
    const body = await (await p.request.get(`/api/charts/${chartId}`, { headers: { 'X-Dev-User': ownerSlug } })).json() as { nodes: { id: string }[] }
    return body.nodes[0].id
  }
})
