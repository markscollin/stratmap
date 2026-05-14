import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'
import { useUserStore } from './store/userStore'
import { useBillingStore, FREE_PLAN, STARTER_PLAN, GROWTH_PLAN } from './store/billingStore'

if (import.meta.env.DEV) {
  (window as any).__devTools = {
    setPermission: (p: string) => useUserStore.setState({ permission: p as any }),
    setPlan: (tier: string) => {
      const plans: Record<string, typeof FREE_PLAN> = { free: FREE_PLAN, starter: STARTER_PLAN, growth: GROWTH_PLAN }
      const plan = plans[tier]
      if (plan) useBillingStore.getState().setPlan(plan)
      else console.warn('Unknown tier. Use: free, starter, growth')
    },
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
