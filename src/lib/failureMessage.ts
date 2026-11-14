import { ApiError } from './apiClient'

/**
 * One sentence for a failed write, for a toast (launch review R-14). The server's own message wins (plan limits,
 * "only admins can…"); a bare 403 says so in words; a network failure says the server cannot be reached.
 * `what` is the action in the past tense's negative, e.g. "delete the chart".
 */
export function failureMessage(err: unknown, what: string): string {
  if (err instanceof ApiError) {
    if (typeof err.body.message === 'string') return err.body.message
    if (err.status === 403) return `You don't have permission to ${what}.`
    if (err.status === 404) return `Couldn't ${what}: it no longer exists. Reload the page.`
    if (err.status === 401) return `Couldn't ${what}: you were signed out. Sign in again.`
    return `Couldn't ${what}. Please try again.`
  }
  return `Couldn't ${what}: can't reach the server. Check your connection and try again.`
}
