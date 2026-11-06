import fs from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test'

export const RUN = process.env.E2E_RUN_ID ?? 'local'

/** A dev-bypass user unique to this run: slug `e2e<run>-<name>`, email `<slug>@e2e.test`. */
export function testUser(name: string) {
  const slug = `e2e${RUN}-${name}`
  return { slug, email: `${slug}@e2e.test` }
}

/** A fresh browser context signed in as that dev-bypass user (see src/lib/devIdentity.ts). */
export async function signedInContext(browser: Browser, slug: string, options: BrowserContextOptions = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext(options)
  await ctx.addInitScript((id) => {
    try {
      localStorage.setItem('stratmap_dev_user', id)
      localStorage.setItem('stratmap_cookie_consent', 'necessary') // the banner would cover buttons
    } catch { /* ignore */ }
  }, slug)
  return ctx
}

/** The most recent invite link emailed to `to` (the server writes mail to a file when no Resend key is set). */
export async function inviteLinkFor(to: string): Promise<string> {
  const file = process.env.E2E_EMAIL_OUTBOX!
  for (let i = 0; i < 20; i++) {
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : []
    for (const line of lines.reverse()) {
      const mail = JSON.parse(line) as { to: string; html: string }
      const m = mail.to === to && /https?:\/\/[^"\s<]*\/invite\/[A-Za-z0-9_-]+/.exec(mail.html)
      if (m) return m[0].replace(/&amp;/g, '&')
    }
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`No invite email for ${to} in ${file}`)
}

/** New user → onboarding → a workspace with no invites and no chart. Ends on /charts. */
export async function onboard(page: Page, workspaceName: string) {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/onboarding/) // a new user has no workspace
  await page.getByTestId('workspace-name').fill(workspaceName)
  await page.getByTestId('continue-btn').click()
  await page.getByTestId('skip-btn').click()
  await expect(page).toHaveURL(/\/charts$/)
}

/** From /charts: create a blank chart through the UI. Ends on the chart's canvas. */
export async function createChart(page: Page, name: string) {
  await page.getByText('New chart').first().click()
  await page.getByPlaceholder(/Q3 Hiring Plan/).fill(name)
  await page.getByRole('button', { name: 'Create chart' }).click()
  await expect(page).toHaveURL(/\/charts\/[^/]+/)
  await expect(page.getByText(name).first()).toBeVisible()
}

/**
 * Puts a test user's workspace on a plan, straight in the database (there is no checkout in e2e).
 * The workspace must already exist (call after `onboard`). Only ever touches this run's own `dev-e2e<run>-…` users.
 */
export async function setPlanFor(slug: string, tier: 'free' | 'starter' | 'growth' | 'enterprise') {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('No database URL for setPlanFor')
  if (!slug.startsWith(`e2e${RUN}-`)) throw new Error(`Refusing to change the plan of a user outside this run: ${slug}`)
  const rows = await neon(url)`UPDATE workspaces SET plan_tier = ${tier} WHERE owner_id = ${`dev-${slug}`} RETURNING id`
  if (rows.length !== 1) throw new Error(`Expected one workspace for ${slug}, changed ${rows.length}`)
}
