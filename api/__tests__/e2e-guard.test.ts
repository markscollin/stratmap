// Launch review R-28: the e2e suite can never run against the real database, and its server listens on this machine only.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
// @ts-expect-error plain .mjs script without types
import { resolveE2eDatabase } from '../../scripts/e2e-guard.mjs'

type Result = { url: string; emulator: boolean } | { error: string }
const resolve = (env: Record<string, string>) => resolveE2eDatabase(env) as Result

describe('resolveE2eDatabase', () => {
  it('refuses a bare DATABASE_URL', () => {
    const r = resolve({ DATABASE_URL: 'postgres://prod' })
    expect('error' in r && r.error).toMatch(/DATABASE_URL is deliberately never used/)
  })
  it('refuses nothing at all', () => { expect('error' in resolve({})).toBe(true) })
  it('refuses an E2E_DATABASE_URL equal to DATABASE_URL', () => {
    expect('error' in resolve({ DATABASE_URL: 'postgres://same', E2E_DATABASE_URL: 'postgres://same' })).toBe(true)
  })
  it('accepts a separate explicit E2E_DATABASE_URL', () => {
    expect(resolve({ DATABASE_URL: 'postgres://prod', E2E_DATABASE_URL: 'postgres://branch' })).toEqual({ url: 'postgres://branch', emulator: false })
  })
  it('accepts the local emulator, and ignores a real DATABASE_URL beside it', () => {
    const r = resolve({ NEON_HTTP_ENDPOINT: 'http://127.0.0.1:4444/sql', DATABASE_URL: 'postgres://prod' })
    expect(r).toEqual({ url: 'postgres://e2e:e2e@127.0.0.1/e2e', emulator: true })
  })
  it('refuses an emulator endpoint that is not on this machine', () => {
    const r = resolve({ NEON_HTTP_ENDPOINT: 'https://db.example.com/sql', E2E_DATABASE_URL: 'postgres://x' })
    expect('error' in r && r.error).toMatch(/not on this machine/)
    expect('error' in resolve({ NEON_HTTP_ENDPOINT: 'nonsense' })).toBe(true)
  })
})

describe('the e2e server', () => {
  it('exits with a clear message when only DATABASE_URL is set (e.g. from .env.local)', () => {
    const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DATABASE_URL: 'postgres://real-data/prod' }
    const out = spawnSync('node', ['scripts/e2e-server.mjs'], { env, encoding: 'utf8', timeout: 20_000 })
    expect(out.status).toBe(1)
    expect(out.stderr).toMatch(/No test database/)
  })

  it('listens on 127.0.0.1 only, and `npm run test:e2e` is the emulator run', () => {
    const src = fs.readFileSync('scripts/e2e-server.mjs', 'utf8')
    expect(src).toMatch(/server\.listen\(port, '127\.0\.0\.1'/)
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
    expect(pkg.scripts['test:e2e']).toBe('node scripts/e2e-local.mjs')
  })

  it('the test helpers never fall back to DATABASE_URL', () => {
    for (const f of ['tests/e2e/helpers.ts', 'tests/e2e/global-teardown.ts']) {
      expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/process\.env\.DATABASE_URL/)
    }
  })
})
