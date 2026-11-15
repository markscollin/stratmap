// Decides which database the e2e server and test helpers may use (launch review R-28). The suite creates users, charts and
// workspaces and deletes them afterwards, and the e2e server accepts the dev-bypass header, so it must never be pointed at
// real data by accident, for example by a DATABASE_URL in .env.local.
//
// Allowed: (a) the local emulator: NEON_HTTP_ENDPOINT is set and points at this machine; the database URL is only a label.
//          (b) an explicit E2E_DATABASE_URL (a throwaway Neon branch) that is not the same as DATABASE_URL.
// Never used: DATABASE_URL on its own.

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/** @returns {{ url: string, emulator: boolean } | { error: string }} */
export function resolveE2eDatabase(env) {
  const endpoint = env.NEON_HTTP_ENDPOINT
  if (endpoint) {
    let host = ''
    try { host = new URL(endpoint).hostname } catch { /* handled below */ }
    if (!LOOPBACK.has(host)) {
      return { error: `NEON_HTTP_ENDPOINT (${host || 'not a URL'}) is not on this machine. The e2e suite only talks to the local emulator; refusing to start.` }
    }
    return { url: env.E2E_DATABASE_URL || 'postgres://e2e:e2e@127.0.0.1/e2e', emulator: true }
  }
  const explicit = env.E2E_DATABASE_URL
  if (!explicit) {
    return { error: 'No test database. Run `npm run test:e2e` (it starts a throwaway in-memory database, no account needed), or set E2E_DATABASE_URL to a throwaway Neon branch. DATABASE_URL is deliberately never used.' }
  }
  if (env.DATABASE_URL && explicit === env.DATABASE_URL) {
    return { error: 'E2E_DATABASE_URL is the same as DATABASE_URL, which is probably real data. Use a separate throwaway branch, or `npm run test:e2e`.' }
  }
  return { url: explicit, emulator: false }
}
