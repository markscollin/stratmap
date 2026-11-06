import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

// Roadmap 3.3. `scripts/e2e-server.mjs` serves the app in dev-bypass mode with the
// API mounted from api/ — no Vercel login and no Clerk key. It talks to the database
// in E2E_DATABASE_URL (else DATABASE_URL): use a throwaway Neon branch, never production.
try { process.loadEnvFile('.env.local') } catch { /* CI has no env file */ }

// Same values for the main process, the workers and the server (children inherit env).
process.env.E2E_RUN_ID ??= Date.now().toString(36)
process.env.E2E_EMAIL_OUTBOX ??= path.resolve('test-results', 'email-outbox.jsonl')
const PORT = process.env.E2E_PORT ?? '3000'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // Skip the cookie banner, which would otherwise sit on top of buttons.
    storageState: {
      cookies: [],
      origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'stratmap_cookie_consent', value: 'necessary' }] }],
    },
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      // Default: the browser `npx playwright install` fetched (CI, laptops). The cloud
      // sandbox ships a different Chromium build, so it sets PW_CHROMIUM_PATH.
      launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
    },
  }],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `http://localhost:${PORT}/privacy`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { E2E_PORT: PORT },
  },
})
