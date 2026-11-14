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
import { pageAccess } from '../../lib/routes'

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

// A failed workspace load is its own outcome (R-13). It used to count as "resolved": a returning person on a new browser was
// sent to onboarding and asked to create a workspace they already had, and an invited viewer was shown as owner. Now a
// network, 5xx or rate-limit failure is retried quietly twice, then shown as "Couldn't load your workspace" with Retry.
const RETRY_DELAYS_MS = [600, 1800]
const isTransient = (err: unknown) => !(err instanceof ApiError) || err.status >= 500 || err.status === 429 || err.status === 408
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
async function fetchWorkspace(): Promise<WorkspaceResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api.get<WorkspaceResponse>('/api/workspace')
    } catch (err) {
      if (!isTransient(err) || attempt >= RETRY_DELAYS_MS.length) throw err
      await sleep(RETRY_DELAYS_MS[attempt])
    }
  }
}

function WorkspaceLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" data-testid="workspace-load-failed" style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Couldn't load your workspace</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 380, lineHeight: 1.6 }}>
        Nothing has been lost. We couldn't reach the server just now. Check your connection and try again.
      </p>
      <button onClick={onRetry} style={{ padding: '10px 22px', background: 'var(--brand)', border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Retry</button>
    </div>
  )
}

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
  // Which kind of page this is decides who may see it (src/lib/routes.ts). A URL with no page behind it is open too: it shows
  // the 404 page instead of being bounced to sign-in first (R-15).
  const { isAuthPage, isPublicPage, isOptionalAuthPage } = pageAccess(pathname)
  // True once we know whether this user has a workspace (after any invite acceptance).
  // The onboarding redirect waits for it, so an invited user never lands there.
  // Each workspace load gets a unique key; `resolvedFor` holds the key of the
  // last load that finished, so a stale result (e.g. before sign-out) never counts.
  const [resolvedFor, setResolvedFor] = useState<string | null>(null)
  const loadKey = useRef<string | null>(null)
  const loadCount = useRef(0)
  // How the workspace load ended for a person: 'ready' (loaded, or confirmed to have none) or 'failed'. Nothing but a spinner
  // is shown until it is known, so a page never renders with the placeholder viewer permission and Free plan (R-13).
  const [outcome, setOutcome] = useState<{ userId: string; status: 'ready' | 'failed' } | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const retry = () => { loadKey.current = null; setOutcome(null); setRetryNonce(n => n + 1) }

  useEffect(() => {
    if (isAuthPage || isPublicPage) return
    if (!isLoaded) return

    if (!isSignedIn) {
      loadKey.current = null
      // A later sign-in must wait for its own load, so forget how the last one ended.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOutcome(null)
      storeSignOut()
      if (!isOptionalAuthPage) navigate('/sign-in')
      return
    }
    if (!clerkUser || loadKey.current?.startsWith(`${clerkUser.id}#`)) return
    const key = `${clerkUser.id}#${++loadCount.current}`
    loadKey.current = key
    const userId = clerkUser.id
    const setResolved = () => { setResolvedFor(key); setOutcome({ userId, status: 'ready' }) }
    const fail = () => { if (loadKey.current === key) setOutcome({ userId, status: 'failed' }) }

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
        applyWorkspace(await fetchWorkspace())
        setResolved()
        return
      } catch (err) {
        if (!(err instanceof ApiError) || err.message !== 'no-workspace') {
          console.error('[auth] workspace fetch failed:', err)
          fail() // not "resolved": never guess what the workspace is
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
        try {
          applyWorkspace(await fetchWorkspace())
        } catch (err) {
          console.error('[auth] workspace fetch after accepting an invite failed:', err)
          fail()
          return
        }
        setResolved()
        if (pathname === '/onboarding') navigate('/dashboard')
        return
      } catch (err) {
        // The server may simply be unreachable: that is not "no invite", and must not send anyone to onboarding.
        if (isTransient(err)) {
          console.error('[auth] invite check failed:', err)
          fail()
          return
        }
        if (token && !(err instanceof ApiError && err.message === 'no-invite')) {
          // The invite page explains what went wrong (expired, wrong account, …). Forget this load so a later visit starts afresh.
          loadKey.current = null
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
  }, [isLoaded, isSignedIn, clerkUser, retryNonce, setUser, setPermission, setWorkspace, setPlan, setSubscription, storeSignOut, navigate, isAuthPage, isPublicPage, isOptionalAuthPage, pathname])

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

  // A signed-in person waits for their workspace before any page renders: otherwise the page shows with the placeholder viewer
  // permission and Free plan (a canvas that is briefly read-only, a chart count that looks over the limit), and an open page
  // flashes its signed-out version.
  const failed = isSignedIn && !!clerkUser && outcome?.userId === clerkUser.id && outcome.status === 'failed'
  if (failed) return <WorkspaceLoadFailed onRetry={retry} />
  const waitingForWorkspace = isSignedIn && !!clerkUser && outcome?.userId !== clerkUser.id
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
