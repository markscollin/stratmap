import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, inviteLinkFor, onboard, createChart } from './helpers'

// The launch-critical loop (roadmap 3.3), as two real users in separate browser
// contexts: sign up → onboarding → create chart → share → invite → accept →
// second workspace → switch. Auth is the dev bypass (each user is a distinct
// identity), so Clerk's own sign-up UI is not exercised here.
const owner = testUser('owner')
const member = testUser('member')
const OWNER_WS = 'Owner Co'
const MEMBER_WS = 'Member Co'
const CHART = 'Launch Plan'

test.describe.serial('sign-up to second workspace', () => {
  let ownerCtx: BrowserContext, memberCtx: BrowserContext
  let ownerPage: Page, memberPage: Page

  test.beforeAll(async ({ browser }) => {
    ownerCtx = await signedInContext(browser, owner.slug)
    memberCtx = await signedInContext(browser, member.slug)
    ownerPage = await ownerCtx.newPage()
    memberPage = await memberCtx.newPage()
  })
  test.afterAll(async () => { await ownerCtx?.close(); await memberCtx?.close() })

  test('a new user lands on onboarding and creates a workspace', async () => {
    await onboard(memberPage, MEMBER_WS)
    await onboard(ownerPage, OWNER_WS)
    await expect(ownerPage.getByRole('button', { name: 'Switch workspace' })).toContainText(OWNER_WS)
  })

  test('the owner creates a chart', async () => {
    await createChart(ownerPage, CHART)
  })

  let shareUrl = ''
  test('the owner shares it and anyone with the link can view it', async ({ browser }) => {
    await ownerPage.getByTitle('Share settings').click()
    await ownerPage.getByTestId('share-toggle').click()
    const field = ownerPage.getByTestId('share-url')
    await expect(field).toBeVisible()
    shareUrl = await field.inputValue()
    expect(shareUrl).toMatch(/\/share\/[A-Za-z0-9]+$/)

    const guest = await browser.newContext() // no identity at all
    const page = await guest.newPage()
    await page.goto(shareUrl)
    await expect(page.getByText(CHART).first()).toBeVisible()
    await guest.close()
  })

  let inviteUrl = ''
  test('the owner invites the member by email', async () => {
    await ownerPage.goto('/settings')
    await ownerPage.getByRole('button', { name: 'Members', exact: true }).click()
    await ownerPage.getByRole('button', { name: /Invite/ }).click()
    await ownerPage.getByPlaceholder('colleague@company.com').fill(member.email)
    await ownerPage.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(ownerPage.getByText(member.email)).toBeVisible()
    inviteUrl = await inviteLinkFor(member.email)
  })

  test('the member accepts and lands in the owner’s workspace', async () => {
    await memberPage.goto(inviteUrl)
    await expect(memberPage.getByRole('heading', { name: `Join ${OWNER_WS}` })).toBeVisible()
    await memberPage.getByRole('button', { name: `Join ${OWNER_WS}` }).click()
    await expect(memberPage.getByRole('button', { name: 'Switch workspace' })).toContainText(OWNER_WS)
    await memberPage.goto('/charts')
    await expect(memberPage.getByText(CHART).first()).toBeVisible()
  })

  test('the member switches back to their own workspace', async () => {
    await memberPage.getByRole('button', { name: 'Switch workspace' }).click()
    const list = memberPage.getByRole('listbox', { name: 'Workspaces' })
    await expect(list.getByRole('option')).toHaveCount(2)
    await list.getByRole('option', { name: new RegExp(MEMBER_WS) }).click()
    await expect(memberPage.getByRole('button', { name: 'Switch workspace' })).toContainText(MEMBER_WS)
    await memberPage.goto('/charts')
    await expect(memberPage.getByText(CHART)).toHaveCount(0) // their own workspace has no such chart
  })

  test('the used invite link no longer works', async () => {
    await memberPage.goto(inviteUrl)
    await expect(memberPage.getByRole('heading', { name: 'Invite unavailable' })).toBeVisible()
  })
})
