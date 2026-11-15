// The app's entry no longer contains Sentry; crashes are buffered until it has loaded (R-44, share/embed first load).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const captureCrash = vi.fn()
const initMonitoring = vi.fn()
const tick = () => new Promise(r => setTimeout(r, 0))

/** Loads a fresh crashReporting whose Sentry module arrives only when `release()` is called (or never, with `fail`). */
async function setup({ fail = false }: { fail?: boolean } = {}) {
  vi.resetModules()
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  vi.doMock('../monitoring', async () => {
    if (fail) throw new Error('chunk failed to load')
    await gate
    return { initMonitoring, captureCrash }
  })
  const reporting = await import('../crashReporting')
  const { CrashBoundary } = await import('../../components/CrashBoundary')
  const arrive = async () => { await tick(); release(); await tick(); await tick() }
  return { ...reporting, CrashBoundary, arrive }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_SENTRY_DSN', 'https://k@o0.ingest.sentry.io/1')
})
afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock('../monitoring') })

describe('crash reporting', () => {
  it('does nothing and loads nothing without a DSN', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    const r = await setup()
    r.startCrashReporting()
    r.reportCrash(new Error('x'))
    await r.arrive()
    expect(initMonitoring).not.toHaveBeenCalled()
  })

  it('keeps errors from before Sentry has loaded and sends them once it has', async () => {
    const r = await setup()
    r.startCrashReporting()
    const boom = new Error('boot-time crash')
    window.dispatchEvent(new ErrorEvent('error', { error: boom, message: 'boot-time crash' }))
    const rejected = new Error('boot-time rejection')
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(rejection, 'reason', { value: rejected })
    window.dispatchEvent(rejection)
    expect(captureCrash).not.toHaveBeenCalled() // Sentry has not arrived yet
    await r.arrive()
    expect(initMonitoring).toHaveBeenCalledTimes(1)
    expect(captureCrash.mock.calls.map(c => c[0])).toEqual([boom, rejected])
  })

  it('stops listening once Sentry has taken over (no double reports)', async () => {
    const r = await setup()
    r.startCrashReporting()
    await r.arrive()
    const swallow = (e: Event) => e.preventDefault() // keeps the test runner from reporting the synthetic error as uncaught
    window.addEventListener('error', swallow)
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('later'), message: 'later' }))
    window.removeEventListener('error', swallow)
    expect(captureCrash).not.toHaveBeenCalled()
  })

  it('a chunk that cannot be fetched is swallowed: no throw, nothing sent', async () => {
    const r = await setup({ fail: true })
    r.startCrashReporting()
    r.reportCrash(new Error('x'))
    await r.arrive()
    expect(captureCrash).not.toHaveBeenCalled()
  })

  it('the error boundary shows its fallback and reports the crash with its component stack', async () => {
    const r = await setup()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Bomb(): never { throw new Error('render crash') }
    render(<r.CrashBoundary fallback={<p>Something went wrong</p>}><Bomb /></r.CrashBoundary>)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    await r.arrive()
    expect(captureCrash).toHaveBeenCalledWith(expect.objectContaining({ message: 'render crash' }), expect.stringContaining('Bomb'))
    err.mockRestore()
  })

  it('nothing the app imports at start-up pulls @sentry/react in statically', () => {
    for (const f of ['src/main.tsx', 'src/lib/crashReporting.ts', 'src/components/CrashBoundary.tsx']) {
      expect(readFileSync(resolve(__dirname, '../../..', f), 'utf8'), f).not.toMatch(/from ['"]@sentry\/react['"]|from ['"]\.\/monitoring['"]|from ['"]\.\.\/lib\/monitoring['"]/)
    }
  })
})
