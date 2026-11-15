// What the browser must forget when someone signs out (R-34). The next person on a shared computer must not start
// from the previous person's plan, usage, selected workspace or half-accepted invite. Their own preferences (theme,
// cookie choice, hint dismissals) are about the browser, not the account, so they stay.
import { useBillingStore, FREE_PLAN } from '../store/billingStore'
import { setSelectedWorkspaceId } from './workspaceSelection'
import { forgetInviteToken } from '../features/auth/pendingInvite'

/** localStorage keys that describe the signed-in account. */
export const ACCOUNT_LOCAL_KEYS = ['stratmap_workspace', 'stratmap_plan', 'stratmap_usage'] as const

export function clearAccountBrowserState(): void {
  // In-memory first: setPlan writes to storage, so it must run before the keys are removed.
  const billing = useBillingStore.getState()
  billing.setPlan(FREE_PLAN)
  billing.setTrial(null)
  billing.setSubscription(null)
  for (const key of ACCOUNT_LOCAL_KEYS) {
    try { localStorage.removeItem(key) } catch { /* storage unavailable */ }
  }
  setSelectedWorkspaceId(null)
  forgetInviteToken()
}
