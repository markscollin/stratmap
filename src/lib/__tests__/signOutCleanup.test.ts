import { describe, it, expect, beforeEach } from 'vitest'
import { clearAccountBrowserState } from '../signOutCleanup'
import { useBillingStore, GROWTH_PLAN, FREE_PLAN } from '../../store/billingStore'
import { getSelectedWorkspaceId, setSelectedWorkspaceId } from '../workspaceSelection'
import { rememberInviteToken, getRememberedInviteToken } from '../../features/auth/pendingInvite'

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

describe('signing out (R-34)', () => {
  it('forgets the account: plan, usage, trial, selected workspace, remembered workspace and invite token', () => {
    useBillingStore.getState().setPlan(GROWTH_PLAN)
    useBillingStore.getState().incrementUsage('chartsUsed')
    useBillingStore.getState().setTrial({ plan: 'growth', endsAt: '2030-01-01T00:00:00Z' })
    setSelectedWorkspaceId('ws-1')
    localStorage.setItem('stratmap_workspace', '{"id":"ws-1"}')
    rememberInviteToken('tok')
    expect(localStorage.getItem('stratmap_plan')).toBeTruthy()

    clearAccountBrowserState()

    for (const key of ['stratmap_plan', 'stratmap_usage', 'stratmap_workspace', 'stratmap_workspace_id']) expect(localStorage.getItem(key)).toBeNull()
    expect(getSelectedWorkspaceId()).toBeNull()
    expect(getRememberedInviteToken()).toBeNull()
    expect(useBillingStore.getState().plan.tier).toBe(FREE_PLAN.tier)
    expect(useBillingStore.getState().trial).toBeNull()
  })

  it('keeps what belongs to the browser, not the account', () => {
    localStorage.setItem('stratmap_theme', 'light')
    localStorage.setItem('stratmap_cookie_consent', '{"analytics":false}')
    clearAccountBrowserState()
    expect(localStorage.getItem('stratmap_theme')).toBe('light')
    expect(localStorage.getItem('stratmap_cookie_consent')).toBeTruthy()
  })

  it('the next person to load the app starts on Free, not on the last person\'s plan', async () => {
    useBillingStore.getState().setPlan(GROWTH_PLAN)
    clearAccountBrowserState()
    expect(localStorage.getItem('stratmap_plan')).toBeNull() // so a fresh page load reads the Free default
  })

  it('does not throw when storage is unavailable', () => {
    const real = Storage.prototype.removeItem
    Storage.prototype.removeItem = () => { throw new Error('denied') }
    try { expect(() => clearAccountBrowserState()).not.toThrow() } finally { Storage.prototype.removeItem = real }
  })
})
