import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ClerkProvider, useUser } from '@clerk/clerk-react'
import { useUserStore, MOCK_USER, MOCK_WORKSPACE } from '../../store/userStore'
import { useToastStore } from '../../store/toastStore'
import { setSelectedWorkspaceId } from '../../lib/workspaceSelection'
import { useBillingStore, FREE_PLAN, PLAN_BY_TIER } from '../../store/billingStore'
import type { PlanTier, Permission, WorkspaceRole, CompanySize, SubscriptionInfo } from '../../types'
import { IS_DEV_BYPASS } from './useAuth'
import { api, ApiError } from '../../lib/apiClient'
import { getDevIdentity, devIdentityEmail } from '../../lib/devIdentity'
import { getRememberedInviteToken, forgetInviteToken } from './pendingInvite'

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

// ── Dev bypass provider (no real Clerk key) ────────────────────────────────
function DevBypassProvider({ children }: { children: ReactNode }) {
  const { setUser, setWorkspace } = useUserStore()
  const devId = getDevIdentity()

  useEffect(() => {
    if (devId) return // a named dev identity goes through UserSync instead
    setUser(MOCK_USER, 'owner')
    setWorkspace(MOCK_WORKSPACE)
  }, [devId, setUser, setWorkspace])

  // A named dev identity (e2e tests) is treated like a real signed-in user.
  if (devId) return <DevIdentitySync devId={devId}>{children}</DevIdentitySync>
  return <>{children}</>
}

function DevIdentitySync({ devId, children }: { devId: string; children: ReactNode }) {
  const identity = useMemo<SyncIdentity>(() => ({
    id: `dev-${devId}`, name: devId, email: devIdentityEmail(devId), imageUrl: undefined,
  }), [devId])
  return <UserSync isLoaded isSignedIn identity={identity}>{children}</UserSync>
}

// ── Clerk sync: hydrates userStore from Clerk's useUser ────────────────────

interface WorkspaceResponse {
  id: string; name: string; ownerRole: string; size: string; createdAt: string
  planTier: PlanTier
  billing?: SubscriptionInfo
  myPermission: Permission | null
  members: Array<{ userId: string; email: string; name: string | null; avatarUrl: string | null; permission: string; joinedAt: string }>
}

interface SyncIdentity { id: string; name: string; email: string; imageUrl?: string }

function ClerkUserSync({ children }: { children: ReactNode }) {
  const { user, isLoaded, isSignedIn } = useUser()
  const identity = useMemo<SyncIdentity | null>(() => user ? {
    id: user.id,
    name: user.fullName ?? user.username ?? user.emailAddresses[0]?.emailAddress ?? 'User',
    email: user.emailAddresses[0]?.emailAddress ?? '',
    imageUrl: user.imageUrl ?? undefined,
  } : null, [user])
  return <UserSync isLoaded={isLoaded} isSignedIn={!!isSignedIn} identity={identity}>{children}</UserSync>
}

// Hydrates userStore from a signed-in identity (Clerk's, or a dev-bypass one) and
// the server's view of the workspace. Shared so both go through the same flow.
function UserSync({ isLoaded, isSignedIn, identity: clerkUser, children }: {
  isLoaded: boolean; isSignedIn: boolean; identity: SyncIdentity | null; children: ReactNode
}) {
  const { setUser, setPermission, setWorkspace, signOut: storeSignOut, workspace } = useUserStore()
  const { setPlan, setSubscription } = useBillingStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isAuthPage   = pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')
  const isPublicPage = pathname === '/' || pathname.startsWith('/share') || pathname.startsWith('/embed/') || pathname.startsWith('/privacy')
    || pathname.startsWith('/terms') || pathname.startsWith('/invite/')
  // Open to everyone (roadmap 2.5) but signed-in people still get their workspace and plan loaded.
  const isOptionalAuthPage = pathname === '/pricing'
  // True once we know whether this user has a workspace (after any invite acceptance).
  // The onboarding redirect waits for it, so an invited user never lands there.
  // Each workspace load gets a unique key; `resolvedFor` holds the key of the
  // last load that finished, so a stale result (e.g. before sign-out) never counts.
  const [resolvedFor, setResolvedFor] = useState<string | null>(null)
  const loadKey = useRef<string | null>(null)
  const loadCount = useRef(0)

  useEffect(() => {
    if (isAuthPage || isPublicPage) return
    if (!isLoaded) return

    if (!isSignedIn) {
      loadKey.current = null
      storeSignOut()
      if (!isOptionalAuthPage) navigate('/sign-in')
      return
    }
    if (!clerkUser || loadKey.current?.startsWith(`${clerkUser.id}#`)) return
    const key = `${clerkUser.id}#${++loadCount.current}`
    loadKey.current = key
    const setResolved = () => setResolvedFor(key)

    // Least privilege until the server says otherwise.
    setUser(
      { id: clerkUser.id, name: clerkUser.name, email: clerkUser.email, avatarUrl: clerkUser.imageUrl },
      'viewer',
    )

    function applyWorkspace(ws: WorkspaceResponse) {
      // Remember it, so later requests and visits stay in this workspace (roadmap 1.2).
      setSelectedWorkspaceId(ws.id)
      setWorkspace({
        id: ws.id,
        name: ws.name,
        ownerRole: ws.ownerRole as WorkspaceRole,
        size: ws.size as CompanySize,
        members: (ws.members ?? []).map(m => ({
          user: { id: m.userId, name: m.name ?? '', email: m.email, avatarUrl: m.avatarUrl ?? undefined },
          permission: m.permission as Permission,
          joinedAt: m.joinedAt,
        })),
        pendingInvites: [],
        createdAt: ws.createdAt ?? new Date().toISOString(),
      })
      setPermission(ws.myPermission ?? 'viewer')
      // Sync billing plan from DB — source of truth for planTier
      setPlan(PLAN_BY_TIER[ws.planTier] ?? FREE_PLAN)
      setSubscription(ws.billing)
    }

    async function load() {
      try {
        applyWorkspace(await api.get<WorkspaceResponse>('/api/workspace'))
        setResolved()
        return
      } catch (err) {
        if (!(err instanceof ApiError) || err.message !== 'no-workspace') {
          console.error('[auth] workspace fetch failed:', err)
          setResolved()
          return
        }
      }

      // No workspace yet: accept a pending invite before falling back to onboarding.
      // Uses the token from an /invite link if we have one, else matches by verified email.
      const token = getRememberedInviteToken()
      try {
        const joined = await api.post<{ workspaceId: string }>('/api/invites/accept', token ? { token } : {})
        forgetInviteToken()
        setSelectedWorkspaceId(joined.workspaceId)
        applyWorkspace(await api.get<WorkspaceResponse>('/api/workspace'))
        setResolved()
        if (pathname === '/onboarding') navigate('/dashboard')
        return
      } catch (err) {
        if (token && !(err instanceof ApiError && err.message === 'no-invite')) {
          // The invite page explains what went wrong (expired, wrong account, …).
          navigate(`/invite/${token}`)
          return
        }
        if (err instanceof ApiError && err.message === 'plan-limit') {
          // Matched an invite by email, but that workspace has no free seat. Say so
          // before onboarding, because creating a workspace would block the invite later.
          useToastStore.getState().addToast(
            `${err.userMessage} Or create your own workspace below.`,
            'warning',
          )
        }
        forgetInviteToken()
      }

      // Genuinely new user → onboarding. Tell analytics once (server checks consent; best effort).
      void api.post('/api/analytics/signed-up', {}).catch(() => {})
      setWorkspace(null)
      setResolved()
    }
    void load()
  }, [isLoaded, isSignedIn, clerkUser, setUser, setPermission, setWorkspace, setPlan, setSubscription, storeSignOut, navigate, isAuthPage, isPublicPage, isOptionalAuthPage, pathname])

  // Once we know there is no workspace, send the user to onboarding
  useEffect(() => {
    if (isAuthPage || isPublicPage) return
    if (!isLoaded || !isSignedIn || !resolvedFor || resolvedFor !== loadKey.current) return
    if (!workspace && pathname !== '/onboarding') {
      navigate('/onboarding')
    }
  }, [isLoaded, isSignedIn, resolvedFor, workspace, navigate, pathname, isAuthPage, isPublicPage])

  // All hooks called above — safe to conditionally return now
  if (isAuthPage || isPublicPage) {
    return <>{children}</>
  }

  // A signed-in person on an open page waits for their workspace, so the page doesn't flash its signed-out version.
  const waitingForWorkspace = isOptionalAuthPage && isSignedIn && !resolvedFor
  if (!isLoaded || waitingForWorkspace) {
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
