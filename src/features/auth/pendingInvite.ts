// Remembers an invite token across the sign-up / sign-in round trip, so that
// AuthProvider can accept it before deciding to send the user to onboarding.
const KEY = 'stratmap_invite_token'

export function rememberInviteToken(token: string) {
  try { sessionStorage.setItem(KEY, token) } catch { /* storage unavailable */ }
}

export function getRememberedInviteToken(): string | null {
  try { return sessionStorage.getItem(KEY) } catch { return null }
}

export function forgetInviteToken() {
  try { sessionStorage.removeItem(KEY) } catch { /* storage unavailable */ }
}
