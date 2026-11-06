import * as Sentry from '@sentry/react'

// Browser error monitoring (roadmap 4.5). Crash reports are part of running the service, so they are
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
