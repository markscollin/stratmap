import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['api/__tests__/**/*.test.ts'],
    testTimeout: 15000,
    // The explicit local-dev opt-in (api/_lib/devBypass.ts, R-16). Tests that prove the bypass is refused delete it.
    env: { ALLOW_DEV_BYPASS: '1' },
  },
})
