import { defineConfig } from 'vitest/config'

// Live smoke tests: run the real API handlers against a REAL Postgres
// (DATABASE_URL — use a Neon dev/preview branch, never production).
// Opt-in: `npm run test:live`. Every row is created inside a throwaway
// workspace with a unique id and deleted afterwards.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['api/__live__/**/*.live.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
})
