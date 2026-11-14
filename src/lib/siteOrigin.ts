// Where the app lives, for absolute links (launch review R-17). Pure: used by the API (emails, checkout redirects) and by the
// build (canonical URLs, sitemap), so both always agree.
//
// Production:   APP_URL → VERCEL_PROJECT_PRODUCTION_URL (the stable domain) → VERCEL_URL (the per-deployment host)
// Preview:      VERCEL_URL first: a link in a preview deployment's email or a checkout redirect must come back to THAT preview
//               (otherwise the test-mode release check in docs/BILLING.md would pay on a preview and land on production)
// Anything else (local, tests): APP_URL if set, else nothing (the caller picks its own fallback)
//
// Before this, emails and redirects used the per-deployment host even in production, so a link in an invite pointed at a
// stale `stratmap-<hash>.vercel.app` deployment instead of the real domain.

export interface OriginEnv {
  APP_URL?: string
  VERCEL_ENV?: string
  VERCEL_PROJECT_PRODUCTION_URL?: string
  VERCEL_URL?: string
}

const HOST = /^[a-z0-9.-]+(:\d+)?$/i

function explicit(env: OriginEnv): string | null {
  const v = env.APP_URL?.trim().replace(/\/+$/, '')
  return v && /^https?:\/\/[^\s]+$/i.test(v) ? v : null
}
const fromHost = (h: string | undefined): string | null => (h && HOST.test(h.trim()) ? `https://${h.trim()}` : null)

/** The origin (no trailing slash), or null when nothing in the environment says. */
export function resolveOrigin(env: OriginEnv): string | null {
  if (env.VERCEL_ENV === 'preview') return fromHost(env.VERCEL_URL) ?? explicit(env) ?? fromHost(env.VERCEL_PROJECT_PRODUCTION_URL)
  return explicit(env) ?? fromHost(env.VERCEL_PROJECT_PRODUCTION_URL) ?? fromHost(env.VERCEL_URL)
}

/** True when this looks like a production deployment that has no APP_URL: links work, but on a Vercel-assigned domain. */
export function missingAppUrlInProduction(env: OriginEnv): boolean {
  return env.VERCEL_ENV === 'production' && !explicit(env)
}
