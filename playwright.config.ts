import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev:local',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30000,
    env: {
      // Trigger dev bypass mode: no real Clerk session needed
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_placeholder',
    },
  },
})
