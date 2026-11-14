/// <reference types="node" />

// The one rule for "may this request skip real authentication or signature checks?" (launch review R-16).
//
// It used to be "VERCEL_ENV is not production or preview", which is also true when VERCEL_ENV is *missing*: on any host that
// is not Vercel, or if system environment variables ever stop reaching the function, the whole API would have run open.
// Now it is an explicit opt-in that a deployed environment can never get:
//   - ALLOW_DEV_BYPASS=1 must be set (in .env.local for `vercel dev`, by scripts/e2e-server.mjs, by the API test config), AND
//   - VERCEL_ENV must not be `production` or `preview`.
// Used by: the x-dev-user header and the no-Clerk-key fallback (auth.ts), the unsigned Stripe event fallback, the fake
// checkout success (checkout.ts) and the synthetic identity (identity.ts). Never add another meaning of "dev mode" next to it.

let warned = false

export function isDevBypassAllowed(): boolean {
  const env = process.env.VERCEL_ENV
  const deployed = env === 'production' || env === 'preview'
  const flag = process.env.ALLOW_DEV_BYPASS === '1'
  if (flag && deployed && !warned) {
    warned = true
    console.error(`[auth] ALLOW_DEV_BYPASS is set on a ${env} deployment. It is ignored here: remove it from the Vercel environment variables.`)
  }
  return flag && !deployed
}
