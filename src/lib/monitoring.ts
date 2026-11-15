import * as Sentry from '@sentry/react'

// Browser error monitoring (roadmap 4.5). This module holds all of @sentry/react (about 31 kB gzipped), so nothing in the app's entry
// imports it: src/lib/crashReporting.ts loads it on demand (R-44, share/embed first load). Crash reports are part of running the service, so they are
// sent for everyone, but only the minimum: no default PII (no IP-derived user, cookies or headers),
// and NO session replay, tracing or feedback integration. If replay or any behavioural recording is
// ever added, it must be started only after hasAnalyticsConsent() is true (see lib/consent.ts).
export function sentryOptions(dsn: string, environment: string): Sentry.BrowserOptions {
  return {
    dsn,
    environment,
    sendDefaultPii: false,
    defaultIntegrations: false,
    integrations: [
      Sentry.inboundFiltersIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.globalHandlersIntegration(),
    ],
  }
}

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (dsn) Sentry.init(sentryOptions(dsn, import.meta.env.MODE))
}

/** Sends one crash. React's component stack, when there is one, goes along as context. */
export function captureCrash(error: unknown, componentStack?: string | null) {
  Sentry.captureException(error, componentStack ? { contexts: { react: { componentStack } } } : undefined)
}
