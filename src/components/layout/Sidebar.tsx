import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Network, Briefcase, BarChart2, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '../../store'

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { path: '/charts',    label: 'Org Charts', Icon: Network },
  { path: '/roles',     label: 'Roles',      Icon: Briefcase },
  { path: '/headcount', label: 'Headcount',  Icon: BarChart2 },
]

function NavBtn({
  label, Icon, active, collapsed, onClick,
}: {
  label: string | null
  Icon: LucideIcon
  active: boolean
  collapsed: boolean
  onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 16px',
        background: active ? 'var(--nav-active)' : hov ? 'var(--nav-hover)' : 'transparent',
        border: 'none',
        borderLeft: active ? '2px solid var(--brand)' : '2px solid transparent',
        cursor: 'pointer',
        color: active ? 'var(--brand)' : hov ? 'var(--text)' : 'var(--muted)',
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        transition: 'all .15s',
        textAlign: 'left',
      }}
    >
      <Icon size={17} style={{ flexShrink: 0 }} />
      {!collapsed && label && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
    </button>
  )
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path)

  return (
    <div style={{
      width: sidebarCollapsed ? 56 : 232,
      flexShrink: 0,
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width .25s cubic-bezier(.4,0,.2,1)',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: sidebarCollapsed ? '0 12px' : '0 16px',
        gap: 10,
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'var(--grad-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 13, color: '#fff', letterSpacing: '-.5px',
        }}>SM</div>
        {!sidebarCollapsed && (
          <span style={{
            fontWeight: 800, fontSize: 16, color: 'var(--text)',
            whiteSpace: 'nowrap', letterSpacing: '-.4px',
          }}>StratMap</span>
        )}
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, paddingTop: 10 }}>
        {NAV_ITEMS.map(({ path, label, Icon }) => (
          <NavBtn
            key={path}
            label={sidebarCollapsed ? null : label}
            Icon={Icon}
            active={isActive(path)}
            collapsed={sidebarCollapsed}
            onClick={() => navigate(path)}
          />
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <NavBtn
          label={sidebarCollapsed ? null : 'Settings'}
          Icon={Settings}
          active={isActive('/settings')}
          collapsed={sidebarCollapsed}
          onClick={() => navigate('/settings')}
        />
        <button
          onClick={toggleSidebar}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: 8,
            padding: '9px 16px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--dim)',
            fontSize: 12,
          }}
        >
          {sidebarCollapsed
            ? <ChevronRight size={15} />
            : <><ChevronLeft size={15} /><span>Collapse</span></>
          }
        </button>
      </div>
    </div>
  )
}
