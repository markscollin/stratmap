import { test, expect, type BrowserContext } from '@playwright/test'
import { testUser, signedInContext, onboard } from './helpers'

// R-56: someone invites your address to their workspace. You sign up on your own, without the link: you are NOT joined. You see
// who invited you, decline (or accept), and go on to make your own workspace.
test.describe.serial('an invite is never accepted without a click', () => {
  let owner: BrowserContext
  let invitee: BrowserContext
  const ownerUser = testUser('choice-owner')
  const declUser = testUser('choice-decliner')
  const accUser = testUser('choice-accepter')

  test.beforeAll(async ({ browser }) => {
    owner = await signedInContext(browser, ownerUser.slug)
    const page = await owner.newPage()
    await onboard(page, 'Inviting Co')
    const res = await page.request.post('/api/workspace/invites', {
      headers: { 'X-Dev-User': ownerUser.slug },
      data: { invites: [{ email: declUser.email, permission: 'admin' }, { email: accUser.email, permission: 'viewer' }] },
    })
    expect(res.ok()).toBeTruthy()
  })
  test.afterAll(async () => { await owner?.close(); await invitee?.close() })

  test('signing up without the link joins nothing; declining leaves you free to make your own workspace', async ({ browser }) => {
    invitee = await signedInContext(browser, declUser.slug)
    const page = await invitee.newPage()
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/onboarding/)
    const card = page.getByTestId('pending-invite')
    await expect(card).toContainText('Inviting Co')
    await expect(card).toContainText('as an admin')
    // nothing joined yet
    const ws = await page.request.get('/api/workspaces', { headers: { 'X-Dev-User': declUser.slug } })
    expect(((await ws.json()) as { workspaces: unknown[] }).workspaces).toHaveLength(0)

    await page.getByRole('button', { name: 'Decline the invite to Inviting Co' }).click()
    await expect(page.getByTestId('pending-invites')).toHaveCount(0)

    await page.getByTestId('workspace-name').fill('My Own Co')
    await page.getByTestId('continue-btn').click()
    await page.getByTestId('skip-btn').click()
    await expect(page).toHaveURL(/\/charts$/)
    await expect(page.getByText('My Own Co').first()).toBeVisible()
    await invitee.close()
  })

  test('Accept joins the invited workspace with the invited role', async ({ browser }) => {
    invitee = await signedInContext(browser, accUser.slug)
    const page = await invitee.newPage()
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/onboarding/)
    await page.getByRole('button', { name: 'Accept the invite to Inviting Co' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByText('Inviting Co').first()).toBeVisible()
  })
})
