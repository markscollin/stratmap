const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days left in a trial (rounded up, never below 0). */
export function trialDaysLeft(endsAt: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / DAY_MS))
}
