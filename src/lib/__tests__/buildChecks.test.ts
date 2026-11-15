import { describe, it, expect } from 'vitest'
import { productionBuildProblem } from '../buildChecks'

describe('productionBuildProblem (R-34)', () => {
  const prod = { VERCEL_ENV: 'production' }
  it('stops a production build with no Clerk key, an empty one, or a placeholder', () => {
    expect(productionBuildProblem(prod)).toMatch(/VITE_CLERK_PUBLISHABLE_KEY/)
    expect(productionBuildProblem({ ...prod, VITE_CLERK_PUBLISHABLE_KEY: '   ' })).toMatch(/missing/)
    expect(productionBuildProblem({ ...prod, VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_placeholder' })).toMatch(/placeholder/)
  })
  it('stops a value that is not a Clerk key at all', () => {
    expect(productionBuildProblem({ ...prod, VITE_CLERK_PUBLISHABLE_KEY: 'sk_live_secret' })).toMatch(/does not look like/)
  })
  it('lets a production build with a test or live key through (test keys stay allowed until the production Clerk instance exists)', () => {
    expect(productionBuildProblem({ ...prod, VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_abc123' })).toBeNull()
    expect(productionBuildProblem({ ...prod, VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_abc123' })).toBeNull()
  })
  it('does not check previews, CI or local builds', () => {
    expect(productionBuildProblem({ VERCEL_ENV: 'preview' })).toBeNull()
    expect(productionBuildProblem({})).toBeNull()
  })
})
