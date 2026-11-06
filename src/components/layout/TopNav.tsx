import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronRight, Search, Sun, Moon, Bell, Menu } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '../../store'
import { useAuth } from '../../features/auth/useAuth'
import { useSignOut } from '../../features/auth/useSignOut'
import { useIsPhone } from '../../hooks/useMediaQuery'

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/charts':    'Org Charts',
  '/roles':     'Roles',
  '/headcount': 'Headcount',
  '/settings':  'Settings',
  '/pricing':   'Pricing',
}

function getLabel(pathname: string): string {
  if (pathname.startsWith('/charts/')) return 'Canvas'
  return PAGE_LABELS[pathname] ?? 'Dashboard'
}

function IconBtn({ id, Icon, onClick, hovBtn, setHovBtn }: {
  id: string
  Icon: LucideIcon
  onClick: () => void
  hovBtn: string | null
  setHovBtn: (v: string | null) => void
}) {
  const hov = hovBtn === id
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovBtn(id)}
      onMouseLeave={() => setHovBtn(null)}
      style={{
        width: 34, height: 34, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hov ? 'var(--nav-hover)' : 'var(--input-bg)',
        border: `1px solid ${hov ? 'var(--border-hover)' : 'var(--border)'}`,
        cursor: 'pointer',
        color: hov ? 'var(--text)' : 'var(--muted)',
        transition: 'all .15s',
      }}
    >
      <Icon size={15} />
    </button>
  )
}

export function TopNav() {
  const { isDark, toggleTheme, setSpotlightOpen, setMobileNavOpen } = useUIStore()
  const isPhone = useIsPhone()
  const { pathname } = useLocation()
  const [hovBtn, setHovBtn] = useState<string | null>(null)
  const [avatarHov, setAvatarHov] = useState(false)
  const label = getLabel(pathname)
  const { user } = useAuth()
  const signOut = useSignOut()

  const handleSignOut = () => signOut()

  return (
    <div style={{
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: isPhone ? '0 12px' : '0 24px',
      gap: 8,
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      {/* Menu (phones) + breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isPhone ? 10 : 6, minWidth: 0 }}>
        {isPhone && (
          <button
            data-testid="nav-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
            style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
          ><Menu size={17} /></button>
        )}
        {!isPhone && <><span style={{ fontSize: 12, color: 'var(--dim)' }}>StratMap</span>
        <ChevronRight size={12} color="var(--dim)" /></>}
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </div>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Search hint — opens Spotlight */}
        {isPhone ? (
          <IconBtn id="search" Icon={Search} onClick={() => setSpotlightOpen(true)} hovBtn={hovBtn} setHovBtn={setHovBtn} />
        ) : <button onClick={() => setSpotlightOpen(true)} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--input-bg)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 12px', width: 196,
          cursor: 'pointer', transition: 'border-color .15s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <Search size={13} color="var(--dim)" />
          <span style={{ fontSize: 13, color: 'var(--dim)', flex: 1, textAlign: 'left' }}>Search…</span>
          <kbd style={{
            fontSize: 10, color: 'var(--dim)',
            background: 'var(--raised)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace',
          }}>⌘K</kbd>
        </button>}

        <IconBtn id="theme" Icon={isDark ? Sun : Moon} onClick={toggleTheme} hovBtn={hovBtn} setHovBtn={setHovBtn} />
        {!isPhone && <IconBtn id="bell"  Icon={Bell}                onClick={() => {}}   hovBtn={hovBtn} setHovBtn={setHovBtn} />}

        {/* User avatar */}
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            onClick={handleSignOut}
            onMouseEnter={() => setAvatarHov(true)}
            onMouseLeave={() => setAvatarHov(false)}
            title={`${user.name} — click to sign out`}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              cursor: 'pointer', flexShrink: 0, objectFit: 'cover',
              outline: avatarHov ? '2px solid var(--brand)' : 'none',
              transition: 'outline .15s',
            }}
          />
        ) : (
          <div
            onClick={handleSignOut}
            onMouseEnter={() => setAvatarHov(true)}
            onMouseLeave={() => setAvatarHov(false)}
            title={user ? `${user.name} — click to sign out` : ''}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--grad-brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff',
              cursor: 'pointer', flexShrink: 0,
              outline: avatarHov ? '2px solid var(--brand-glow)' : 'none',
              transition: 'outline .15s',
            }}
          >{user?.initials ?? '?'}</div>
        )}
      </div>
    </div>
  )
}
