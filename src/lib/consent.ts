// The cookie banner's choice (see components/ui/CookieConsent.tsx). Analytics (roadmap 2.3) runs
// only after "Accept all": the browser then adds X-Analytics-Consent to API requests and the
// server sends product events. Nothing is loaded in the browser either way.
export const CONSENT_KEY = 'stratmap_cookie_consent'
export type ConsentChoice = 'all' | 'necessary'

export function getStoredConsent(): string | null {
  try { return localStorage.getItem(CONSENT_KEY) } catch { return null }
}

export function storeConsent(value: ConsentChoice) {
  try { localStorage.setItem(CONSENT_KEY, value) } catch { /* ignore */ }
}

export function hasAnalyticsConsent(): boolean {
  return getStoredConsent() === 'all'
}
