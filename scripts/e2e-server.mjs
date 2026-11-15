// Local server for the Playwright suite (roadmap 3.3). It replaces `vercel dev`,
// which needs a Vercel login and loads the real Clerk key from .env.local, so the
// dev bypass never engaged. This serves the same app with:
//   - the Vite frontend in dev-bypass mode (placeholder Clerk key),
//   - every api/**/*.ts handler mounted at its file path (`[id]` → req.query.id),
//   - no Clerk/Stripe/Anthropic/Resend keys, so a test can never bill or email anyone.
// Database: the local emulator (npm run test:e2e sets NEON_HTTP_ENDPOINT) or an explicit E2E_DATABASE_URL on a throwaway Neon
// branch. DATABASE_URL is never used (scripts/e2e-guard.mjs). The server listens on 127.0.0.1 only.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { resolveE2eDatabase } from './e2e-guard.mjs'

const root = path.resolve(import.meta.dirname, '..')
process.chdir(root)
try { process.loadEnvFile('.env.local') } catch { /* no local env file (CI) */ }

const port = Number(process.env.E2E_PORT ?? 3000)
// Never the real DATABASE_URL (R-28): see scripts/e2e-guard.mjs.
const database = resolveE2eDatabase(process.env)
if ('error' in database) {
  console.error(`e2e: ${database.error}`)
  process.exit(1)
}
const dbUrl = database.url

// Force bypass + strip every external-service key (process env beats .env files).
process.env.DATABASE_URL = dbUrl
process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_placeholder'
process.env.VITE_SENTRY_DSN = ''
for (const k of ['CLERK_SECRET_KEY', 'VERCEL_ENV', 'ANTHROPIC_API_KEY', 'RESEND_API_KEY', 'SENTRY_DSN',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'ADMIN_SECRET']) delete process.env[k]
// New workspaces start on a 14-day Growth trial in real life (R-18); the e2e suite wants them on Free, as before. Tests that
// need a trial grant one with setTrialFor() in tests/e2e/helpers.ts.
process.env.NEW_WORKSPACE_TRIAL_DAYS = '0'
process.env.ALLOW_DEV_BYPASS = '1' // the explicit local-only opt-in for the x-dev-user header (api/_lib/devBypass.ts)
process.env.APP_URL = `http://localhost:${port}`
process.env.E2E_EMAIL_OUTBOX ??= path.join(root, 'test-results', 'email-outbox.jsonl')
fs.mkdirSync(path.dirname(process.env.E2E_EMAIL_OUTBOX), { recursive: true })
fs.writeFileSync(process.env.E2E_EMAIL_OUTBOX, '')

// ── Route table from the api/ folder ──────────────────────────────────────
function collect(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_')) continue // _lib, __tests__, __live__
    const p = path.join(dir, e.name)
    if (e.isDirectory()) collect(p, out)
    else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}
const routes = collect(path.join(root, 'api')).map(file => {
  const rel = path.relative(path.join(root, 'api'), file).replace(/\.ts$/, '').split(path.sep)
  if (rel.at(-1) === 'index') rel.pop()
  const params = []
  const re = rel.map(seg => {
    const m = /^\[(.+)\]$/.exec(seg)
    if (m) { params.push(m[1]); return '([^/]+)' }
    return seg.replace(/[.*+?^${}()|\\]/g, '\\$&')
  }).join('/')
  return { file, params, re: new RegExp(`^/api/${re}/?$`), dynamic: params.length }
}).sort((a, b) => a.dynamic - b.dynamic) // static routes win over [param] ones

const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' })

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

async function handleApi(req, res, url) {
  const route = routes.find(r => r.re.test(url.pathname))
  if (!route) { res.statusCode = 404; res.setHeader('content-type', 'application/json'); return res.end('{"error":"Not found"}') }
  const match = route.re.exec(url.pathname)
  const query = Object.fromEntries(url.searchParams)
  route.params.forEach((p, i) => { query[p] = decodeURIComponent(match[i + 1]) })

  // Vercel-style helpers the handlers rely on.
  const raw = await readBody(req)
  req.query = query
  req.body = raw.length === 0 ? undefined
    : /json/.test(req.headers['content-type'] ?? '') ? safeJson(raw.toString()) : raw
  res.status = code => { res.statusCode = code; return res }
  res.json = obj => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); return res }
  res.send = body => { res.end(body); return res }
  res.redirect = (a, b) => { res.statusCode = typeof a === 'number' ? a : (b ?? 307); res.setHeader('location', typeof a === 'number' ? b : a); res.end() }

  try {
    const mod = await vite.ssrLoadModule(route.file)
    await mod.default(req, res)
  } catch (err) {
    console.error('[e2e-server]', url.pathname, err)
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
    else res.end()
  }
}
const safeJson = s => { try { return JSON.parse(s) } catch { return undefined } }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  if (url.pathname.startsWith('/api/')) return void handleApi(req, res, url)
  vite.middlewares(req, res)
})
// Loopback only (R-28): the API runs with the dev bypass on, so it must not be reachable from the network.
server.listen(port, '127.0.0.1', () => console.log(`e2e server ready on http://localhost:${port} (${routes.length} api routes, 127.0.0.1 only)`))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { void vite.close(); server.close(); process.exit(0) })
