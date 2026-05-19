import { useEffect, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ClerkProvider, useUser } from '@clerk/clerk-react'
import { useUserStore, MOCK_USER, MOCK_WORKSPACE } from '../../store/userStore'
import { IS_DEV_BYPASS } from './useAuth'
import { api } from '../../lib/apiClient'

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

// ── Dev bypass provider (no real Clerk key) ────────────────────────────────
function DevBypassProvider({ children }: { children: ReactNode }) {
  const { setUser, setWorkspace } = useUserStore()

  useEffect(() => {
    setUser(MOCK_USER, 'owner')
    setWorkspace(MOCK_WORKSPACE)
  }, [setUser, setWorkspace])

  return <>{children}</>
}

// ── Clerk sync: hydrates userStore from Clerk's useUser ────────────────────
function ClerkUserSync({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded, isSignedIn } = useUser()
  const { setUser, setWorkspace, signOut: storeSignOut, workspace } = useUserStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isAuthPage = pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')

  // Skip all auth logic on sign-in/sign-up pages — let Clerk work undisturbed
  if (isAuthPage) {
    return <>{children}</>
  }

  useEffect(() => {
    if (!isLoaded) return

    if (!isSignedIn) {
      storeSignOut()
      navigate('/sign-in')
      return
    }

    if (clerkUser) {
      const name = clerkUser.fullName ?? clerkUser.username ?? clerkUser.emailAddresses[0]?.emailAddress ?? 'User'
      setUser(
        {
          id: clerkUser.id,
          name,
          email: clerkUser.emailAddresses[0]?.emailAddress ?? '',
          avatarUrl: clerkUser.imageUrl ?? undefined,
        },
        'owner'
      )
      // Load workspace from API (replaces localStorage-only approach)
      api.get<{ id: string; name: string; ownerRole: string; size: string }>('/api/workspace')
        .then(ws => {
          setWorkspace({
            id: ws.id,
            name: ws.name,
            ownerRole: ws.ownerRole as import('../../types').WorkspaceRole,
            size: ws.size as import('../../types').CompanySize,
            members: [],
            pendingInvites: [],
            createdAt: new Date().toISOString(),
          })
        })
        .catch((err: Error) => {
          if (err.message === 'no-workspace') {
            // User authenticated but no workspace in DB → clear stale cache and go to onboarding
            setWorkspace(null)
          } else {
            console.error('[auth] workspace fetch failed:', err)
          }
        })
    }
  }, [isLoaded, isSignedIn, clerkUser, setUser, storeSignOut, navigate])

  // Once loaded + signed in, redirect to onboarding if no workspace set
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    if (!workspace && pathname !== '/onboarding') {
      navigate('/onboarding')
    }
  }, [isLoaded, isSignedIn, workspace, navigate, pathname])

  if (!isLoaded) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '3px solid var(--brand-bg)',
          borderTop: '3px solid var(--brand)',
          animation: 'spin .7s linear infinite',
        }} />
      </div>
    )
  }

  return <>{children}</>
}

// ── Exported provider: chooses Clerk or dev-bypass ─────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  if (IS_DEV_BYPASS) {
    return <DevBypassProvider>{children}</DevBypassProvider>
  }

  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/sign-in">
      <ClerkUserSync>{children}</ClerkUserSync>
    </ClerkProvider>
  )
}
