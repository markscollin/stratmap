import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, inviteLinkFor } from './helpers'

// Ownership transfer: the owner hands the workspace to an admin, becomes an admin and can then leave.
const WS = 'Handover Co'
let ownerCtx: BrowserContext, adminCtx: BrowserContext
let owner: Page, admin: Page
let ownerSlug: string, adminSlug: string

test.describe.serial('transfer ownership', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    const o = testUser(`xfer${testInfo.retry}`)
    const a = testUser(`xfera${testInfo.retry}`)
    ownerSlug = o.slug; adminSlug = a.slug
    ownerCtx = await signedInContext(browser, o.slug); owner = await ownerCtx.newPage()
    adminCtx = await signedInContext(browser, a.slug); admin = await adminCtx.newPage()
    await onboard(owner, WS)
    const res = await owner.request.post('/api/workspace/invites', {
      headers: { 'X-Dev-User': o.slug }, data: { invites: [{ email: a.email, permission: 'admin' }] },
    })
    expect(res.status()).toBe(201)
    await admin.goto(await inviteLinkFor(a.email))
    await admin.getByRole('button', { name: `Join ${WS}` }).click()
    await expect(admin.getByRole('button', { name: 'Switch workspace' })).toContainText(WS)
  })
  test.afterAll(async () => { await ownerCtx?.close(); await adminCtx?.close() })

  test('only the owner is offered the transfer', async () => {
    await admin.goto('/settings')
    await expect(admin.getByRole('button', { name: /transfer ownership/i })).toHaveCount(0)
    await owner.goto('/settings')
    await expect(owner.getByRole('button', { name: /transfer ownership…/i })).toBeVisible()
    await expect(owner.getByRole('button', { name: /leave workspace/i })).toHaveCount(0)
  })

  test('the owner hands over and is then an admin who may leave; the admin is the owner', async () => {
    await owner.getByRole('button', { name: /transfer ownership…/i }).click()
    await owner.getByLabel('New owner').selectOption(`dev-${adminSlug}`)
    await owner.getByLabel(/type handover co to confirm/i).fill(WS)
    const done = owner.waitForResponse(r => /\/api\/workspace\/transfer-ownership$/.test(r.url()) && r.request().method() === 'POST')
    await owner.getByRole('button', { name: 'Transfer ownership', exact: true }).click()
    expect((await done).status()).toBe(200)
    await expect(owner).toHaveURL(/\/dashboard/)

    await owner.goto('/settings')
    await expect(owner.getByRole('button', { name: /transfer ownership/i })).toHaveCount(0)
    await expect(owner.getByRole('button', { name: /leave workspace…/i })).toBeVisible()

    await admin.goto('/settings')
    await expect(admin.getByRole('button', { name: /transfer ownership…/i })).toBeVisible()
    await expect(admin.getByRole('button', { name: /delete workspace…/i })).toBeVisible()
    expect(ownerSlug).not.toBe(adminSlug)
  })
})
