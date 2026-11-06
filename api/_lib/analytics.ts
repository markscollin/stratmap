/// <reference types="node" />
// Product analytics (roadmap 2.3). Server-side only: no analytics script ever loads in the browser.
//
// Rules (owner-decided):
//  - Only for people who clicked "Accept all" in the cookie banner. The browser says so on every
//    API request with `X-Analytics-Consent: 1` (src/lib/consent.ts); without it nothing is sent.
//  - Opaque ids only: the user id, the workspace id (a PostHog group) and the plan tier. Never an
//    email, a name, a chart or role name, salary, or any other content. Properties are counts.
//  - Best effort: a missing key, a slow PostHog or an error never affects the request.
//  - Milestones are sent once. Each carries a deterministic event uuid, so a retry or a repeat
//    (for example deleting every chart and creating one again) is deduplicated by PostHog.
//
// Set POSTHOG_KEY (project API key) to turn it on; POSTHOG_HOST defaults to the EU cloud.
import { createHash } from 'node:crypto'
import type { VercelRequest } from '@vercel/node'

export const CONSENT_HEADER = 'x-analytics-consent'

/** The funnel, in order. */
export type FunnelEvent =
  | 'signed_up'
  | 'workspace_created'
  | 'first_chart_created'
  | 'ten_roles_reached'
  | 'invite_sent'
  | 'share_enabled'
  | 'upgraded'

export function hasAnalyticsConsent(req: Pick<VercelRequest, 'headers'>): boolean {
  const raw = req.headers[CONSENT_HEADER]
  return (Array.isArray(raw) ? raw[0] : raw) === '1'
}

/** A stable UUID-shaped id for "this milestone, for this subject". */
export function eventUuid(event: FunnelEvent, subject: string): string {
  const h = createHash('sha256').update(`stratmap:${event}:${subject}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

export interface TrackOptions {
  /** Who did it. */
  userId: string
  workspaceId?: string
  /** Whether this person accepted analytics. Pass `hasAnalyticsConsent(req)`. */
  consent: boolean
  /** Dedupe key: the milestone happens once per subject. Defaults to the workspace, else the user. */
  subject?: string
  /** Counts and tiers only. Never content or personal data. */
  props?: Record<string, number | string | boolean>
}

const TIMEOUT_MS = 1500

/** Sends one funnel event. Never throws. Resolves once PostHog answered or the timeout hit. */
export async function track(event: FunnelEvent, opts: TrackOptions): Promise<void> {
  const key = process.env.POSTHOG_KEY
  if (!key || !opts.consent) return
  const host = (process.env.POSTHOG_HOST || 'https://eu.i.posthog.com').replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: opts.userId,
        uuid: eventUuid(event, opts.subject ?? opts.workspaceId ?? opts.userId),
        timestamp: new Date().toISOString(),
        properties: {
          ...opts.props,
          ...(opts.workspaceId ? { $groups: { workspace: opts.workspaceId } } : {}),
          environment: process.env.VERCEL_ENV ?? 'development',
          $lib: 'stratmap-server',
        },
      }),
    })
  } catch (err) {
    console.warn('[analytics] capture failed:', (err as Error)?.message)
  } finally {
    clearTimeout(timer)
  }
}
