import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { testUser, signedInContext, onboard, setPlanFor, inviteLinkFor } from './helpers'

// Headcount cost modelling (roadmap 5): an admin adds hires with salary ranges and sees the budget by quarter;
// an invited editor can plan hires but never receives (or sees) a salary.
const YEAR = new Date().getFullYear()
test.describe.serial('headcount budget', () => {
  let ownerCtx: BrowserContext, editorCtx: BrowserContext
  let owner: Page, editor: Page
  let ownerSlug = ''
  const WS = 'Budget Co'

  test.beforeAll(async ({ browser }, testInfo) => {
    const o = testUser(`budget${testInfo.retry}`)
    ownerSlug = o.slug
    ownerCtx = await signedInContext(browser, o.slug)
    owner = await ownerCtx.newPage()
    await onboard(owner, WS)
    await setPlanFor(o.slug, 'growth')
    editorCtx = await signedInContext(browser, testUser(`budgeted${testInfo.retry}`).slug)
    editor = await editorCtx.newPage()
  })
  test.afterAll(async () => { await ownerCtx?.close(); await editorCtx?.close() })

  async function addHire(p: Page, title: string, quarter: string, salary?: { min: string; max: string; currency: string }) {
    await p.getByRole('button', { name: /Add hire/ }).first().click()
    await p.getByPlaceholder('Job title *').fill(title)
    await p.getByRole('button', { name: quarter, exact: true }).click()
    if (salary) {
      await p.getByLabel('Minimum salary').fill(salary.min)
      await p.getByLabel('Maximum salary').fill(salary.max)
      await p.getByLabel('Salary currency').fill(salary.currency)
    }
    const saved = p.waitForResponse(r => /\/api\/headcount$/.test(r.url()) && r.request().method() === 'POST' && r.ok())
    await p.getByPlaceholder('Job title *').locator('xpath=ancestor::div[3]').getByRole('button', { name: 'Add hire' }).click()
    await saved
  }

  test('the admin adds hires and sees the budget by quarter, in each currency', async () => {
    await owner.goto('/headcount')
    await addHire(owner, 'Data Engineer', 'Q2', { min: '100000', max: '140000', currency: 'usd' })
    await addHire(owner, 'Designer', 'Q1', { min: '80000', max: '80000', currency: 'GBP' })
    await addHire(owner, 'Recruiter', 'Q3')

    const budget = owner.getByTestId('headcount-budget')
    await expect(budget).toContainText(`Budget ${YEAR}`)
    await expect(owner.getByTestId('budget-USD-q1')).toContainText('USD 0')
    await expect(owner.getByTestId('budget-USD-q2')).toContainText('USD 30,000')
    await expect(owner.getByTestId('budget-USD-year')).toContainText('USD 90,000')
    await expect(owner.getByTestId('budget-USD-run')).toContainText('USD 120,000')
    await expect(owner.getByTestId('budget-GBP-year')).toContainText('GBP 80,000')
    await expect(owner.getByTestId('budget-uncosted')).toContainText('Recruiter')
    await expect(owner.getByTestId('plan-salary').first()).toBeVisible()
  })

  test('the budget survives a reload (it is saved on the server)', async () => {
    await owner.reload()
    await expect(owner.getByTestId('budget-USD-year')).toContainText('USD 90,000')
  })

  test('an invited editor sees the hires but no salaries, and the server never sends them', async () => {
    const invitee = testUser(`budgeted${test.info().retry}`)
    const invited = await owner.request.post('/api/workspace/invites', { headers: { 'X-Dev-User': ownerSlug }, data: { invites: [{ email: invitee.email, permission: 'editor' }] } })
    expect(invited.status()).toBe(201)
    await editor.goto(await inviteLinkFor(invitee.email))
    await editor.getByRole('button', { name: `Join ${WS}` }).click()
    await expect(editor.getByRole('button', { name: 'Switch workspace' })).toContainText(WS)

    await editor.goto('/headcount')
    await expect(editor.getByText('Data Engineer')).toBeVisible()
    await expect(editor.getByTestId('headcount-budget')).toHaveCount(0)
    await expect(editor.getByTestId('plan-salary')).toHaveCount(0)
    await expect(editor.locator('body')).not.toContainText(/100,000|140,000|120,000/)

    // What the browser actually received: no salary fields at all.
    const wsId = (await (await editor.request.get('/api/workspaces', { headers: { 'X-Dev-User': invitee.slug } })).json()).workspaces[0].id
    const api = await editor.request.get('/api/headcount', { headers: { 'X-Dev-User': invitee.slug, 'X-Workspace-Id': wsId } })
    const plans = await api.json() as Record<string, unknown>[]
    expect(plans.length).toBe(3)
    for (const p of plans) for (const k of ['salaryMin', 'salaryMax', 'salaryCurrency']) expect(p).not.toHaveProperty(k)
  })

  test('the budget fits a phone screen', async ({ browser }, testInfo) => {
    const phone = await signedInContext(browser, testUser(`budget${testInfo.retry}`).slug, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const p = await phone.newPage()
    await p.goto('/headcount')
    await expect(p.getByTestId('headcount-budget')).toBeVisible()
    expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    if (process.env.BUDGET_SHOT) await p.screenshot({ path: process.env.BUDGET_SHOT })
    await phone.close()
  })
})
