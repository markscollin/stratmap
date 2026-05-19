import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'
import { useUserStore } from './store/userStore'
import { useBillingStore, FREE_PLAN, STARTER_PLAN, GROWTH_PLAN } from './store/billingStore'

// Restore path after 404.html SPA redirect (production direct-URL navigation)
const spaRedirect = sessionStorage.getItem('spa-redirect')
if (spaRedirect) {
  sessionStorage.removeItem('spa-redirect')
  window.history.replaceState(null, '', spaRedirect)
}

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
