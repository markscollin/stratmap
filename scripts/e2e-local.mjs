#!/usr/bin/env node
// Runs the Playwright suite against a throwaway in-memory database, with no Neon account and no secrets:
//
//   npm run test:e2e:local                      the whole suite
//   npm run test:e2e:local -- tests/e2e/audit.spec.ts   extra arguments go to Playwright
//
// It starts scripts/neon-http-emulator.mjs (PGlite behind Neon's HTTP protocol, real migrations applied), points the app
// and the test helpers at it, runs `playwright test`, and shuts it down. This is the same setup CI uses.
import { spawn } from 'node:child_process'
import { startEmulator } from './neon-http-emulator.mjs'

const emulator = await startEmulator({ port: Number(process.env.NEON_EMULATOR_PORT ?? 0), quiet: true })

// A label only: the emulator ignores the credentials. DATABASE_URL is removed so a real database can never be reached.
const env = {
  ...process.env,
  NEON_HTTP_ENDPOINT: emulator.url,
  E2E_DATABASE_URL: 'postgres://e2e:e2e@127.0.0.1/e2e',
}
delete env.DATABASE_URL

const child = spawn('npx', ['playwright', 'test', ...process.argv.slice(2)], { stdio: 'inherit', env })
child.on('exit', async (code, signal) => {
  await emulator.close()
  process.exit(code ?? (signal ? 1 : 0))
})
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
