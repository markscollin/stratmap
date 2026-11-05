import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'
import { PaymentBanner } from '../../features/billing/PaymentBanner'
import { ChartLimitBanner } from '../../features/billing/ChartLimitBanner'

export function Layout() {
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TopNav />
        <PaymentBanner />
        <ChartLimitBanner />
        <main style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
