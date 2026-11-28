// R-78: one line on what the last BambooHR sync did, for the sync dialog. Pure.

export interface SyncResult {
  at: string; status: 'ok' | 'failed' | 'held' | 'unchanged'; reason?: string; trigger: 'manual' | 'scheduled'
  joiners?: number; leavers?: number; moves?: number; changed?: number
}

export function resultLine(r: SyncResult | null): string | null {
  if (!r) return null
  const when = new Date(r.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const who = r.trigger === 'scheduled' ? 'Daily sync' : 'Last sync'
  if (r.status === 'ok') return `${who} on ${when}: ${r.joiners ?? 0} joined, ${r.leavers ?? 0} left, ${r.moves ?? 0} moved, ${r.changed ?? 0} changed.`
  if (r.status === 'unchanged') return `${who} on ${when}: already up to date.`
  if (r.status === 'held') return `${who} on ${when} waited for a review: ${r.reason}`
  return `${who} on ${when} did not finish: ${r.reason}`
}
