// Checks that stop a bad production build before it ships (R-34). Pure, so it is unit-tested; vite.config.ts runs it.

/**
 * Why this build must not go to production, or null. Without a real Clerk key the browser app starts in its
 * development mode (a pretend signed-in owner). The server refuses that identity, so nobody would be harmed, but
 * the live site would be broken in a confusing way, so the build fails instead.
 * Only Vercel's production builds are checked: previews, CI and local builds may run without keys.
 */
export function productionBuildProblem(env: Record<string, string | undefined>): string | null {
  if (env.VERCEL_ENV !== 'production') return null
  const key = (env.VITE_CLERK_PUBLISHABLE_KEY ?? '').trim()
  if (!key || key.endsWith('placeholder')) {
    return 'VITE_CLERK_PUBLISHABLE_KEY is missing or a placeholder. A production build without it would run as a pretend owner instead of asking people to sign in. Set it in Vercel → Settings → Environment Variables (Production).'
  }
  if (!/^pk_(test|live)_/.test(key)) {
    return 'VITE_CLERK_PUBLISHABLE_KEY does not look like a Clerk publishable key (it should start with pk_live_ or pk_test_).'
  }
  return null
}
