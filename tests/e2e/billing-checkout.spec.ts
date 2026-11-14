import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, inviteLinkFor } from './helpers'

// Launch review R-20: the Upgrade button used to fail without a word, and an editor was offered it although the server
// refuses billing to non-admins. Now a failure says why, and a non-admin is told to ask an admin.
const WS = 'Checkout Co'

test.describe.serial('checkout button', () => {
  let ownerCtx: BrowserContext, editorCtx: BrowserContext
  let owner: Page, editor: Page
  let ownerSlug = ''
  let editorUser: ReturnType<typeof testUser>

  test.beforeAll(async ({ browser }, testInfo) => {
    const o = testUser(`pay${testInfo.retry}`)
    ownerSlug = o.slug
    editorUser = testUser(`paye${testInfo.retry}`)
    ownerCtx = await signedInContext(browser, o.slug); owner = await ownerCtx.newPage()
    editorCtx = await signedInContext(browser, editorUser.slug); editor = await editorCtx.newPage()
    await onboard(owner, WS)
  })
  test.afterAll(async () => { await ownerCtx?.close(); await editorCtx?.close() })

  test('an invited editor is told to ask an admin, with no button that can only fail', async () => {
    const res = await owner.request.post('/api/workspace/invites', {
      headers: { 'X-Dev-User': ownerSlug },
      data: { invites: [{ email: editorUser.email, permission: 'editor' }] },
    })
    expect(res.status()).toBe(201)
    await editor.goto(await inviteLinkFor(editorUser.email))
    await editor.getByRole('button', { name: `Join ${WS}` }).click()
    await expect(editor.getByRole('button', { name: 'Switch workspace' })).toContainText(WS)

    await editor.goto('/pricing')
    const asks = editor.getByRole('button', { name: 'Ask an admin to upgrade' })
    await expect(asks.first()).toBeVisible()
    await expect(asks.first()).toBeDisabled()
  })

  test('the owner can start checkout, and a failure is explained instead of silently re-enabling the button', async () => {
    await owner.route('**/api/checkout', route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: 'billing-unavailable', message: 'Billing is not available right now. Please try again later or contact support.' }),
    }))
    await owner.goto('/pricing')
    const start = owner.getByRole('button', { name: 'Get started' }).first()
    await expect(start).toBeEnabled()
    await start.click()
    await expect(owner.getByText('Billing is not available right now.')).toBeVisible()
    await expect(start).toBeEnabled()
    await owner.unroute('**/api/checkout')
  })
})
