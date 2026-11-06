import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'
import { DesktopHint } from './DesktopHint'
import { PaymentBanner } from '../../features/billing/PaymentBanner'
import { ChartLimitBanner } from '../../features/billing/ChartLimitBanner'
import { useIsPhone } from '../../hooks/useMediaQuery'
import { useUIStore } from '../../store'

/** Pages that are built for a desktop-width screen (roadmap 2.8): on a phone they scroll and say so. */
const DESKTOP_FIRST = ['/roles', '/headcount', '/settings']

/**
 * The signed-in app shell. Renders the matched child route, or `children` when used directly (the pricing page does).
 * On a phone the sidebar becomes a slide-in drawer opened from the top bar (roadmap 2.8).
 */
export function Layout({ children }: { children?: ReactNode } = {}) {
  const isPhone = useIsPhone()
  const { pathname } = useLocation()
  const mobileNavOpen = useUIStore(s => s.mobileNavOpen)
  const setMobileNavOpen = useUIStore(s => s.setMobileNavOpen)
  const drawerOpen = isPhone && mobileNavOpen

  // The drawer closes on any navigation, when the screen grows past phone width, and on Escape.
  useEffect(() => { setMobileNavOpen(false) }, [pathname, isPhone, setMobileNavOpen])
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileNavOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, setMobileNavOpen])

  return (
    <div style={{
      display: 'flex',
      height: isPhone ? '100dvh' : '100vh',
      overflow: 'hidden',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: "'DM Sans Variable', sans-serif",
    }}>
      {!isPhone && <Sidebar />}
      {drawerOpen && (
        <>
          <div
            data-testid="nav-backdrop"
            onClick={() => setMobileNavOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 90 }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            style={{ position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 100, boxShadow: '8px 0 32px rgba(0,0,0,.4)' }}
          >
            <Sidebar drawer onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </>
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TopNav />
        <PaymentBanner />
        <ChartLimitBanner />
        {isPhone && DESKTOP_FIRST.some(p => pathname.startsWith(p)) && <DesktopHint />}
        <main style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}
