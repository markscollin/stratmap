// The owner's helper scripts (scripts/check-env.mjs, scripts/check-webhook.mjs) run as real processes.
import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync, spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stratmap-owner-scripts-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

const GOOD = {
  DATABASE_URL: 'postgres://u:p@host/db', CLERK_SECRET_KEY: 'sk_live_abc', VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_abc',
  STRIPE_SECRET_KEY: 'sk_live_abc', STRIPE_WEBHOOK_SECRET: 'whsec_abc',
  STRIPE_STARTER_MONTHLY_PRICE_ID: 'price_1', STRIPE_STARTER_ANNUAL_PRICE_ID: 'price_2',
  STRIPE_GROWTH_MONTHLY_PRICE_ID: 'price_3', STRIPE_GROWTH_ANNUAL_PRICE_ID: 'price_4',
  CRON_SECRET: 'a'.repeat(40), ADMIN_SECRET: 'b'.repeat(40), RESEND_API_KEY: 're_abc',
  APP_URL: 'https://stratmap.example.com', ANTHROPIC_API_KEY: 'sk-ant-abc',
  SENTRY_DSN: 'https://k@o.ingest.sentry.io/1', VITE_SENTRY_DSN: 'https://k@o.ingest.sentry.io/1',
  EMAIL_FROM: 'StratMap <hi@stratmap.example.com>', VITE_SUPPORT_EMAIL: 'help@stratmap.example.com',
}
const checkEnv = (vars: Record<string, string>) => {
  const file = path.join(dir, `env-${Math.random().toString(36).slice(2)}`)
  fs.writeFileSync(file, Object.entries(vars).map(([k, v]) => `${k}="${v}"`).join('\n'))
  const r = spawnSync('node', ['scripts/check-env.mjs', file], { encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr }
}

describe('scripts/check-env.mjs', () => {
  it('passes a complete production environment, and prints no value', () => {
    const r = checkEnv(GOOD)
    expect(r.code).toBe(0)
    expect(r.out).toContain('Nothing launch-blocking')
    for (const secret of ['sk_live_abc', 'whsec_abc', 'postgres://u:p@host/db', 'a'.repeat(40), 're_abc']) expect(r.out).not.toContain(secret)
  })

  it('blocks on test keys, a missing webhook secret, a .vercel.app APP_URL and a short cron secret', () => {
    const { STRIPE_WEBHOOK_SECRET: _w, ...rest } = GOOD
    const r = checkEnv({ ...rest, CLERK_SECRET_KEY: 'sk_test_abc', STRIPE_SECRET_KEY: 'sk_test_abc', APP_URL: 'https://x.vercel.app', CRON_SECRET: 'short' })
    expect(r.code).toBe(1)
    for (const name of ['CLERK_SECRET_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'APP_URL', 'CRON_SECRET']) expect(r.out).toMatch(new RegExp(`BLOCK\\s+${name}`))
  })

  it('blocks if the dev bypass flag is set, and warns about a switched-off trial', () => {
    const r = checkEnv({ ...GOOD, ALLOW_DEV_BYPASS: '1', NEW_WORKSPACE_TRIAL_DAYS: '0' })
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/BLOCK\s+ALLOW_DEV_BYPASS/)
    expect(r.out).toMatch(/warn\s+NEW_WORKSPACE_TRIAL_DAYS/)
  })

  it('only warns (exit 0) when the optional monitoring variables are missing', () => {
    const { SENTRY_DSN: _s, VITE_SENTRY_DSN: _v, ANTHROPIC_API_KEY: _a, ...rest } = GOOD
    const r = checkEnv(rest)
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/warn\s+SENTRY_DSN/)
  })

  it('understands quotes, comments and `export` lines', () => {
    const file = path.join(dir, 'quoted')
    fs.writeFileSync(file, `# comment\nexport CRON_SECRET='${'c'.repeat(30)}'\nADMIN_SECRET=${'d'.repeat(30)}\n`)
    const r = spawnSync('node', ['scripts/check-env.mjs', file], { encoding: 'utf8' })
    expect(r.stdout).toMatch(/ok\s+CRON_SECRET/)
    expect(r.stdout).toMatch(/ok\s+ADMIN_SECRET/)
  })

  it('says how to use it when run without a file', () => {
    const r = spawnSync('node', ['scripts/check-env.mjs'], { encoding: 'utf8' })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('vercel env pull')
  })
})

// A tiny stand-in for the deployed webhook, answering whatever the test says.
function serve(answer: (req: http.IncomingMessage, body: string) => { status: number; body: string }) {
  return new Promise<{ url: string; close: () => void; seen: { sig?: string; body: string; url?: string }[] }>(resolve => {
    const seen: { sig?: string; body: string; url?: string }[] = []
    const srv = http.createServer((req, res) => {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', () => {
        seen.push({ sig: req.headers['stripe-signature'] as string | undefined, body, url: req.url })
        const a = answer(req, body)
        res.statusCode = a.status
        res.end(a.body)
      })
    }).listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(srv.address() as { port: number }).port}`, close: () => srv.close(), seen }))
  })
}
const runWebhook = (...args: string[]) => new Promise<{ code: number | null; out: string }>(resolve => {
  const p = spawn('node', ['scripts/check-webhook.mjs', ...args])
  let out = ''
  p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
  p.on('close', code => resolve({ code, out }))
})

describe('scripts/check-webhook.mjs', () => {
  it('sends a validly signed event and passes on 200', async () => {
    const s = await serve(() => ({ status: 200, body: '{"received":true}' }))
    const r = await runWebhook(s.url, 'whsec_test_secret')
    s.close()
    expect(r.code).toBe(0)
    expect(r.out).toContain('PASS')
    expect(s.seen).toHaveLength(1)
    expect(s.seen[0].sig).toMatch(/^t=\d+,v1=[0-9a-f]+/)
    expect(JSON.parse(s.seen[0].body).type).toBe('customer.subscription.updated')
    expect(s.seen[0].url).toBe('/api/webhooks/stripe')
  })

  it('also passes on the expected "Webhook handler failed" 500 (the body and signature were fine)', async () => {
    const s = await serve(() => ({ status: 500, body: '{"error":"Webhook handler failed"}' }))
    const r = await runWebhook(s.url, 'whsec_x')
    s.close()
    expect(r.code).toBe(0)
  })

  it('FAILS loudly on "Could not read raw body", the problem this check exists for', async () => {
    const s = await serve(() => ({ status: 400, body: '{"error":"Could not read raw body"}' }))
    const r = await runWebhook(s.url, 'whsec_x')
    s.close()
    expect(r.code).toBe(1)
    expect(r.out).toContain('Could not read raw body')
    expect(r.out).toContain('nobody would be upgraded')
  })

  it('explains a wrong signing secret and a protected preview', async () => {
    const bad = await serve(() => ({ status: 400, body: '{"error":"Invalid signature"}' }))
    expect((await runWebhook(bad.url, 'whsec_x')).out).toContain('does not match')
    bad.close()
    const protectedPreview = await serve(() => ({ status: 401, body: 'Authentication Required' }))
    const r = await runWebhook(protectedPreview.url, 'whsec_x')
    protectedPreview.close()
    expect(r.out).toContain('Protection Bypass')
  })

  it('passes the protection-bypass secret as a query parameter', async () => {
    const s = await serve(() => ({ status: 200, body: '{}' }))
    await runWebhook(s.url, 'whsec_x', 'bypass123')
    s.close()
    expect(s.seen[0].url).toContain('x-vercel-protection-bypass=bypass123')
  })

  it('refuses to run against what looks like production, and without a whsec_ secret', async () => {
    expect((await runWebhook('https://stratmap-seven.vercel.app', 'whsec_x')).code).toBe(2)
    expect((await runWebhook('https://stratmap.app', 'whsec_x')).code).toBe(2)
    expect((await runWebhook('http://127.0.0.1:1', 'not-a-secret')).code).toBe(2)
  })
})
