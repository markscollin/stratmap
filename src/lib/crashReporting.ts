// Crash reporting without Sentry in the app's first download. @sentry/react is about 31 kB gzipped, and every page (landing, share,
// embed, the app) used to wait for it. Now the entry carries only this small file; Sentry is fetched right after the first render
// (`startCrashReporting`) or when a React crash needs reporting (`reportCrash`).
//
// The gap is the moment before Sentry has arrived. Errors and unhandled rejections in that window are kept (up to MAX_BUFFERED) and
// sent once it is loaded, so a boot-time crash is still reported, just a few hundred milliseconds late. If the chunk cannot be
// fetched (offline, a blocker) nothing is lost that could have been sent, and nothing throws.
type Monitoring = typeof import('./monitoring')
interface Crash { error: unknown; componentStack?: string | null }

const MAX_BUFFERED = 20
const buffered: Crash[] = []
let loading: Promise<Monitoring | null> | null = null

function dsnConfigured(): boolean { return !!import.meta.env.VITE_SENTRY_DSN }

function load(): Promise<Monitoring | null> {
  loading ??= import('./monitoring').then(m => { m.initMonitoring(); return m }).catch(() => null)
  return loading
}

function keep(crash: Crash) { if (buffered.length < MAX_BUFFERED) buffered.push(crash) }

/** Call once at start-up, before the first render. A no-op without VITE_SENTRY_DSN. */
export function startCrashReporting(): void {
  if (!dsnConfigured()) return
  const onError = (e: ErrorEvent) => keep({ error: e.error ?? e.message })
  const onRejection = (e: PromiseRejectionEvent) => keep({ error: e.reason })
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  void load().then(m => {
    // Sentry's own handlers are installed now; ours were only a stand-in.
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
    const pending = buffered.splice(0)
    if (m) for (const c of pending) m.captureCrash(c.error, c.componentStack)
  })
}

/** For the error boundary: report a crash that React caught. Safe to call before or after Sentry has loaded. */
export function reportCrash(error: unknown, componentStack?: string | null): void {
  if (!dsnConfigured()) return
  void load().then(m => m?.captureCrash(error, componentStack))
}

