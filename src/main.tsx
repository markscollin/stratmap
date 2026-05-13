import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'
import { useUserStore } from './store/userStore'

if (import.meta.env.DEV) {
  (window as any).__devTools = {
    setPermission: (p: string) => useUserStore.setState({ permission: p as any }),
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
