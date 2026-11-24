#!/usr/bin/env node
// Checks the Vercel environment variables a production launch needs, WITHOUT printing any value (launch review O-07).
//
//   vercel env pull --environment=production .env.vercel-production     (Vercel CLI; writes a local file, never commit it)
//   npm run check:env -- .env.vercel-production
//
// Exit code 1 when something launch-blocking is wrong. The file is read, parsed and discarded; only names and verdicts are printed.
import fs from 'node:fs'

export function parseEnv(text) {
  const out = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[line.slice(0, eq).trim().replace(/^export\s+/, '')] = v
  }
  return out
}

const long = (min) => (v) => v.length >= min || `too short (need at least ${min} characters; make one with: openssl rand -hex 32)`
const startsWith = (...p) => (v) => p.some(x => v.startsWith(x)) || `should start with ${p.join(' or ')}`

// level: 'block' = launch cannot go ahead without it, 'warn' = should be set, 'info' = optional
const RULES = [
  ['block', 'DATABASE_URL', startsWith('postgres://', 'postgresql://'), 'Neon connection string (production branch)'],
  ['block', 'CLERK_SECRET_KEY', startsWith('sk_live_'), 'Clerk production secret key (sk_live_, not sk_test_) (O-01)'],
  ['block', 'VITE_CLERK_PUBLISHABLE_KEY', startsWith('pk_live_'), 'Clerk production publishable key (pk_live_) (O-01)'],
  ['block', 'STRIPE_SECRET_KEY', startsWith('sk_live_'), 'Stripe live secret key (O-04)'],
  ['block', 'STRIPE_WEBHOOK_SECRET', startsWith('whsec_'), 'signing secret of the live webhook endpoint (O-04)'],
  ['block', 'STRIPE_STARTER_MONTHLY_PRICE_ID', startsWith('price_'), 'live price id'],
  ['block', 'STRIPE_STARTER_ANNUAL_PRICE_ID', startsWith('price_'), 'live price id'],
  ['block', 'STRIPE_GROWTH_MONTHLY_PRICE_ID', startsWith('price_'), 'live price id'],
  ['block', 'STRIPE_GROWTH_ANNUAL_PRICE_ID', startsWith('price_'), 'live price id'],
  ['block', 'CRON_SECRET', long(24), 'without it the daily purge never runs and deleted workspaces are kept for ever'],
  ['block', 'ADMIN_SECRET', long(24), 'protects /api/admin/grant-trial'],
  ['block', 'RESEND_API_KEY', startsWith('re_'), 'without it no invite or notification email is sent'],
  ['block', 'APP_URL', (v) => (/^https:\/\/[^\s/]+$/.test(v) && !v.endsWith('.vercel.app')) || 'should be your real https domain with no path, not a .vercel.app address (O-03)', 'links in emails, checkout redirects, canonical URLs'],
  ['warn', 'ANTHROPIC_API_KEY', startsWith('sk-ant-'), 'AI drafting answers "not configured" without it (also set a spend limit in the Anthropic console, O-08)'],
  ['warn', 'SENTRY_DSN', startsWith('https://'), 'server errors are not reported without it'],
  ['warn', 'VITE_SENTRY_DSN', startsWith('https://'), 'browser errors are not reported without it (build-time variable)'],
  ['warn', 'EMAIL_FROM', (v) => v.includes('@') || 'should contain an address', 'sender of every email; the default may not be on your verified domain'],
  ['warn', 'VITE_SUPPORT_EMAIL', (v) => v.includes('@') || 'should be an email address', 'shown on the payment-received page when the plan has not changed'],
  ['warn', 'BILLING_ALERT_EMAIL', (v) => v.includes('@') || 'should be an email address', 'your own address: refunds and disputes in Stripe are emailed here (they are always sent to Sentry too)'],
  ['info', 'STRIPE_AUTOMATIC_TAX', (v) => v === '1' || 'should be 1 (on) or unset (off)', 'set to 1 only after registering for tax and turning on Stripe Tax (R-60, D-6)'],
  ['info', 'POSTHOG_KEY', () => true, 'product analytics (only for people who accept cookies)'],
]

/** Returns { problems: [{level,name,message}], ok: [name] }. Never includes a value. */
export function checkEnv(env) {
  const problems = []
  const ok = []
  for (const [level, name, test, why] of RULES) {
    const v = env[name]
    if (v === undefined || v === '') {
      if (level !== 'info') problems.push({ level, name, message: `missing: ${why}` })
      continue
    }
    const r = test(v)
    if (r === true) ok.push(name)
    else problems.push({ level: level === 'info' ? 'warn' : level, name, message: `${r}` })
  }
  if (env.ALLOW_DEV_BYPASS !== undefined) {
    problems.push({ level: 'block', name: 'ALLOW_DEV_BYPASS', message: 'must NOT be set in Vercel (it is the local-only dev login switch; the server ignores it there, but remove it)' })
  }
  if (env.NEW_WORKSPACE_TRIAL_DAYS !== undefined && env.NEW_WORKSPACE_TRIAL_DAYS !== '14') {
    problems.push({ level: 'warn', name: 'NEW_WORKSPACE_TRIAL_DAYS', message: `is ${env.NEW_WORKSPACE_TRIAL_DAYS === '0' ? '0, so new workspaces get NO trial' : 'not 14'}: leave it unset for the default of 14 days` })
  }
  if (env.VERCEL_ENV === undefined) {
    problems.push({ level: 'warn', name: 'VERCEL_ENV', message: 'not in this file (normal for `vercel env pull`); make sure "Automatically expose System Environment Variables" is on in Vercel → Settings → Environment Variables' })
  }
  return { problems, ok }
}

function main() {
  const file = process.argv[2]
  if (!file) { console.error('usage: npm run check:env -- <file from `vercel env pull --environment=production <file>`>'); process.exit(2) }
  if (!fs.existsSync(file)) { console.error(`No such file: ${file}`); process.exit(2) }
  const { problems, ok } = checkEnv(parseEnv(fs.readFileSync(file, 'utf8')))
  console.log(`Checked ${file} (values are never printed)\n`)
  for (const name of ok) console.log(`  ok     ${name}`)
  for (const p of problems) console.log(`  ${p.level === 'block' ? 'BLOCK ' : 'warn  '} ${p.name}: ${p.message}`)
  const blocks = problems.filter(p => p.level === 'block').length
  console.log(`\n${blocks === 0 ? 'Nothing launch-blocking.' : `${blocks} launch-blocking problem${blocks === 1 ? '' : 's'}.`} ${problems.length - blocks} warning${problems.length - blocks === 1 ? '' : 's'}.`)
  process.exit(blocks === 0 ? 0 : 1)
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) main()
