/// <reference types="node" />
import { resolveOrigin, missingAppUrlInProduction } from '../../src/lib/siteOrigin'

// The app's base URL for absolute links (checkout redirects, invite and comment emails). The order is in src/lib/siteOrigin.ts:
// on production APP_URL, then the stable production domain, then the per-deployment host; on a preview, that preview.
let warned = false

export function getAppUrl(): string {
  if (!warned && missingAppUrlInProduction(process.env)) {
    warned = true
    console.error('[url] APP_URL is not set on a production deployment: emails and redirects use the Vercel-assigned domain. Set APP_URL to the real domain in Vercel (launch review O-03).')
  }
  return resolveOrigin(process.env) ?? 'http://localhost:3000'
}
