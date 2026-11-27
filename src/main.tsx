import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startCrashReporting } from './lib/crashReporting'
import { CrashBoundary } from './components/CrashBoundary'
import './styles/globals.css'
import App from './App.tsx'
import { useUserStore } from './store/userStore'
import { useBillingStore, PLAN_BY_TIER } from './store/billingStore'
import type { Permission } from './types/user'
import type { PlanTier } from './types'

// Error monitoring — no-op unless VITE_SENTRY_DSN is configured. Sentry itself loads on demand (lib/crashReporting.ts);
// lib/monitoring.ts says what is sent.
startCrashReporting()

if (import.meta.env.DEV) {
  (window as Window & { __devTools?: unknown }).__devTools = {
    setPermission: (p: string) => useUserStore.setState({ permission: p as Permission }),
    setPlan: (tier: string) => {
      const plan = PLAN_BY_TIER[tier as PlanTier]
      if (plan) useBillingStore.getState().setPlan(plan)
      else console.warn('Unknown tier. Use: free, starter, growth, scale, enterprise')
    },
  }
}

const crashFallback = (
  <div style={{
    minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24,
  }}>
    <h1 style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</h1>
    <p style={{ fontSize: 14, color: 'var(--muted)' }}>Please reload the page. If the problem persists, contact support.</p>
    <button
      onClick={() => window.location.reload()}
      style={{ padding: '9px 18px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
    >
      Reload
    </button>
  </div>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashBoundary fallback={crashFallback}>
      <App />
    </CrashBoundary>
  </StrictMode>,
)
