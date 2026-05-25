/// <reference types="node" />
import * as Sentry from '@sentry/node'

let initialized = false

function ensureInit(): boolean {
  if (!process.env.SENTRY_DSN) return false
  if (!initialized) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? 'development',
      tracesSampleRate: 0.1,
    })
    initialized = true
  }
  return true
}

// Report a server-side error to Sentry. No-ops when SENTRY_DSN is unset (local/dev).
// Apply alongside the existing console.error in any route's catch block.
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  if (!ensureInit()) return
  Sentry.captureException(err, context ? { extra: context } : undefined)
}
