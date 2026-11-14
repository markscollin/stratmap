import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Plus, Users, Sparkles, X, Lock, ChevronDown, Check } from 'lucide-react'
import { useUserStore } from '../store/userStore'
import { usePermission } from '../hooks/usePermission'
import { usePlanLimits } from '../hooks/usePlanLimits'
import { api, ApiError } from '../lib/apiClient'
import { failureMessage } from '../lib/failureMessage'
import { useToastStore } from '../store/toastStore'
import { PLAN_LIMITS, UNLIMITED } from '../lib/plans'
import { useBillingStore } from '../store/billingStore'
import { ActivityTab } from '../features/audit/ActivityTab'
import { DataRightsSection } from '../features/dataRights/DataRightsSection'
import { DeletedWorkspaceNotice } from '../features/dataRights/DeletedWorkspaceNotice'
import { ManageBillingButton } from '../features/billing/ManageBillingButton'
import type { Permission, PlanTier, SubscriptionInfo } from '../types'

type Tab = 'general' | 'members' | 'billing' | 'notifications' | 'activity'
const TABS: Tab[] = ['general', 'members', 'billing', 'notifications', 'activity']

export function SettingsView() {
  // ?tab=billing deep-links here (the Customer Portal and payment emails return to it).
  const [params] = useSearchParams()
  const initial = params.get('tab') as Tab | null
  const { canAdmin } = usePermission()
  // The activity log is for owners and admins (roadmap 4.4); the API enforces it too.
  const visibleTabs = (['General', 'Members', 'Billing', 'Notifications', ...(canAdmin ? ['Activity'] : [])]) as string[]
  const [tab, setTab] = useState<Tab>(initial && TABS.includes(initial) ? initial : 'general')
  return (
    <div style={{ padding: 32, animation: 'fadeUp .3s ease-out' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.4px' }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Manage your workspace and team</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 28, overflowX: 'auto' }}>
        {visibleTabs.map(t => {
          const key = t.toLowerCase() as Tab
          const active = tab === key
          return (
            <button key={t} onClick={() => setTab(key)} style={{
              padding: '10px 18px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${active ? 'var(--brand)' : 'transparent'}`,
              color: active ? 'var(--brand)' : 'var(--muted)',
              fontSize: 14, fontWeight: active ? 600 : 400,
              cursor: 'pointer', marginBottom: -1, transition: 'all .15s',
            }}>{t}</button>
          )
        })}
      </div>

      {tab === 'general'       && <GeneralTab />}
      {tab === 'members'       && <MembersTab />}
      {tab === 'billing'       && <BillingTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'activity'      && canAdmin && <ActivityTab />}
    </div>
  )
}

function FocusInput({ id, label, type, placeholder, value, onChange, focus, setFocus }: {
  id: string; label: string; type: string; placeholder: string
  value: string; onChange: (v: string) => void
  focus: string | null; setFocus: (v: string | null) => void
}) {
  const isFocused = focus === id
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocus(id)}
        onBlur={() => setFocus(null)}
        style={{
          width: '100%', padding: '10px 12px',
          background: 'var(--input-bg)',
          border: `1px solid ${isFocused ? 'var(--brand)' : 'var(--border)'}`,
          boxShadow: isFocused ? '0 0 0 3px var(--brand-bg)' : 'none',
          borderRadius: 8, color: 'var(--text)', fontSize: 14, transition: 'all .15s',
        }}
      />
    </div>
  )
}

function GeneralTab() {
  const { workspace, setWorkspace } = useUserStore()
  const [wName, setWName] = useState(workspace?.name ?? '')
  const [focus, setFocus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Sync input when workspace loads asynchronously (e.g. dev bypass hydration)
  useEffect(() => {
    if (workspace?.name && !wName) setWName(workspace.name)
  }, [workspace?.name])

  const handleSave = async () => {
    if (!wName.trim() || saving) return
    setSaving(true)
    try {
      await api.put('/api/workspace', { name: wName.trim() })
      if (workspace) setWorkspace({ ...workspace, name: wName.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('[SettingsView] save workspace failed:', err)
      useToastStore.getState().addToast(failureMessage(err, 'rename the workspace'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 22 }}>Workspace</h3>
        <FocusInput id="name" label="Workspace name" type="text" placeholder="My Organisation" value={wName} onChange={setWName} focus={focus} setFocus={setFocus} />
        <button
          onClick={handleSave}
          disabled={!wName.trim() || saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', border: 'none', borderRadius: 8,
            background: saved ? 'var(--success)' : (wName.trim() ? 'var(--grad-brand)' : 'var(--raised)'),
            color: wName.trim() ? '#fff' : 'var(--dim)',
            fontSize: 14, fontWeight: 600,
            cursor: wName.trim() && !saving ? 'pointer' : 'default',
            transition: 'background .2s',
          }}
        >
          {saved ? <><Check size={14} /> Saved</> : saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
      <div style={{ marginTop: 20 }}><DeletedWorkspaceNotice /></div>
      <DataRightsSection />
    </div>
  )
}

const ROLE_LABELS: Record<Permission, string> = {
  owner: 'Owner', admin: 'Admin', editor: 'Editor', commenter: 'Commenter', viewer: 'Viewer',
}

interface ApiMember { userId: string; email: string; name: string | null; avatarUrl: string | null; permission: Permission; joinedAt: string }
interface ApiInvite { id: string; email: string; permission: Permission; sentAt: string; expiresAt: string | null; expired: boolean }

const RANK: Record<Permission, number> = { owner: 5, admin: 4, editor: 3, commenter: 2, viewer: 1 }

function MembersTab() {
  const { workspace, user, setWorkspace } = useUserStore()
  const { permission: myPermission, canAdmin } = usePermission()
  const { currentTier } = usePlanLimits()
  const seatLimit = PLAN_LIMITS[currentTier].seats
  const planName = currentTier.charAt(0).toUpperCase() + currentTier.slice(1)

  const [members, setMembers] = useState<ApiMember[]>([])
  const [invites, setInvites] = useState<ApiInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Permission>('editor')
  const [inviteFocus, setInviteFocus] = useState(false)

  // You can only grant, change or remove roles below your own (enforced by the API too).
  const grantable = (['admin', 'editor', 'commenter', 'viewer'] as Permission[]).filter(r => RANK[r] < RANK[myPermission])
  const canManage = (p: Permission) => canAdmin && RANK[p] < RANK[myPermission]

  const liveInvites = invites.filter(i => !i.expired)
  const seatsUsed = members.length + liveInvites.length
  const unlimited = seatLimit === UNLIMITED
  const atLimit = !unlimited && seatsUsed >= seatLimit

  const fetchTeam = useCallback(() => Promise.all([
    api.get<{ members: ApiMember[] }>('/api/workspace'),
    canAdmin ? api.get<{ invites: ApiInvite[] }>('/api/workspace/invites') : Promise.resolve({ invites: [] as ApiInvite[] }),
  ]), [canAdmin])

  const applyTeam = useCallback(([ws, inv]: Awaited<ReturnType<typeof fetchTeam>>) => {
    setMembers(ws.members)
    setInvites(inv.invites)
    // Keep the shared store in step so other screens see the same members.
    const current = useUserStore.getState().workspace
    if (current) {
      setWorkspace({
        ...current,
        members: ws.members.map(m => ({
          user: { id: m.userId, name: m.name ?? '', email: m.email, avatarUrl: m.avatarUrl ?? undefined },
          permission: m.permission,
          joinedAt: m.joinedAt,
        })),
      })
    }
  }, [setWorkspace])

  useEffect(() => {
    fetchTeam()
      .then(applyTeam)
      .catch(err => setError(err instanceof ApiError ? err.userMessage : 'Could not load team members'))
      .finally(() => setLoading(false))
  }, [fetchTeam, applyTeam])

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key)
    setError(null)
    try {
      await action()
      applyTeam(await fetchTeam())
    } catch (err) {
      setError(err instanceof ApiError
        ? err.userMessage
        : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  function handleSendInvite() {
    const email = inviteEmail.trim()
    if (!email) return
    void run('invite', async () => {
      await api.post('/api/workspace/invites', { invites: [{ email, permission: inviteRole }] })
      setInviteEmail('')
      setShowInviteForm(false)
    })
  }

  if (!workspace) return null

  return (
    <div style={{ maxWidth: 580 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow-sm)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Team members</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {unlimited ? `${seatsUsed} seats used` : `${seatsUsed} of ${seatLimit} seats used`} · {planName} plan
              {liveInvites.length > 0 && ` (incl. ${liveInvites.length} pending)`}
            </p>
          </div>
          {canAdmin && (
            <button
              onClick={() => setShowInviteForm(v => !v)}
              disabled={atLimit}
              title={atLimit ? 'All seats are in use' : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: atLimit ? 'var(--raised)' : 'var(--grad-brand)', border: 'none', borderRadius: 8, color: atLimit ? 'var(--dim)' : '#fff', fontSize: 13, fontWeight: 600, cursor: atLimit ? 'not-allowed' : 'pointer' }}
            >
              <Plus size={13} /> Invite
            </button>
          )}
        </div>

        {/* Seat usage bar */}
        {!unlimited && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ height: 4, borderRadius: 4, background: 'var(--raised)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, width: `${Math.min((seatsUsed / seatLimit) * 100, 100)}%`, background: atLimit ? 'var(--warn)' : 'var(--brand)', transition: 'width .3s' }} />
            </div>
            {atLimit && (
              <p style={{ fontSize: 11, color: 'var(--warn)', marginTop: 5 }}>
                All seats used. <Link to="/pricing" style={{ color: 'var(--brand)' }}>Upgrade to add more</Link>
              </p>
            )}
          </div>
        )}

        {error && (
          <div role="alert" style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10, fontSize: 12 }}>
            {error}
          </div>
        )}

        {/* Invite form */}
        {showInviteForm && canAdmin && (
          <div style={{ background: 'var(--raised)', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Invite a team member</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="email"
                aria-label="Email address"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onFocus={() => setInviteFocus(true)}
                onBlur={() => setInviteFocus(false)}
                onKeyDown={e => e.key === 'Enter' && handleSendInvite()}
                style={{
                  flex: 1, minWidth: 180, padding: '8px 12px', background: 'var(--input-bg)',
                  border: `1px solid ${inviteFocus ? 'var(--brand)' : 'var(--border)'}`,
                  boxShadow: inviteFocus ? '0 0 0 3px var(--brand-bg)' : 'none',
                  borderRadius: 8, color: 'var(--text)', fontSize: 13, transition: 'all .15s',
                }}
              />
              <select
                aria-label="Role"
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as Permission)}
                style={{ padding: '8px 10px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}
              >
                {grantable.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <button
                onClick={handleSendInvite}
                disabled={!inviteEmail.trim() || busy === 'invite'}
                style={{ padding: '8px 16px', background: inviteEmail.trim() ? 'var(--grad-brand)' : 'var(--raised)', border: 'none', borderRadius: 8, color: inviteEmail.trim() ? '#fff' : 'var(--dim)', fontSize: 13, fontWeight: 600, cursor: inviteEmail.trim() ? 'pointer' : 'not-allowed' }}
              >
                {busy === 'invite' ? 'Sending…' : 'Send'}
              </button>
              <button aria-label="Cancel" onClick={() => setShowInviteForm(false)} style={{ padding: '8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer' }}>
                <X size={13} />
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>They'll get an email with a link that works once and expires in 7 days.</p>
          </div>
        )}

        {/* Member list */}
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading members…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {members.map(m => {
              const label = m.name || m.email
              const initials = label.split(/[\s@.]/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
              const isCurrentUser = m.userId === user?.id
              const canChange = !isCurrentUser && canManage(m.permission)
              return (
                <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--raised)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {label} {isCurrentUser && <span style={{ fontSize: 11, color: 'var(--muted)' }}>(you)</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{m.email}</div>
                  </div>
                  {canChange ? (
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <select
                        aria-label={`Role for ${label}`}
                        value={m.permission}
                        disabled={busy === `role:${m.userId}`}
                        onChange={e => {
                          const permission = e.target.value as Permission
                          void run(`role:${m.userId}`, () => api.put(`/api/workspace/members/${encodeURIComponent(m.userId)}`, { permission }))
                        }}
                        style={{ appearance: 'none', padding: '4px 24px 4px 10px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}
                      >
                        {grantable.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                      <ChevronDown size={11} style={{ position: 'absolute', right: 7, pointerEvents: 'none', color: 'var(--muted)' }} />
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 10px', background: 'var(--nav-hover)', borderRadius: 6 }}>
                      {ROLE_LABELS[m.permission]}
                    </span>
                  )}
                  {canChange && (
                    <button
                      aria-label={`Remove ${label}`}
                      disabled={busy === `remove:${m.userId}`}
                      onClick={() => {
                        if (!window.confirm(`Remove ${label} from ${workspace.name}? They lose access immediately.`)) return
                        void run(`remove:${m.userId}`, () => api.delete(`/api/workspace/members/${encodeURIComponent(m.userId)}`))
                      }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dim)', padding: 4, display: 'flex', alignItems: 'center' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pending invites (admins only) */}
        {invites.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Pending invites</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {invites.map(inv => {
                const manageable = canManage(inv.permission)
                return (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 10, background: 'var(--raised)', border: '1px dashed var(--border)' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--nav-hover)', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Users size={14} color="var(--dim)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 1 }}>
                        Invited as {ROLE_LABELS[inv.permission]} · sent {new Date(inv.sentAt).toLocaleDateString()}
                      </div>
                    </div>
                    {inv.expired
                      ? <span style={{ fontSize: 11, color: 'var(--danger)', background: 'var(--danger-bg)', padding: '3px 8px', borderRadius: 20 }}>Expired</span>
                      : <span style={{ fontSize: 11, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '3px 8px', borderRadius: 20 }}>Pending</span>}
                    {manageable && (
                      <button
                        disabled={busy === `resend:${inv.id}`}
                        onClick={() => void run(`resend:${inv.id}`, () => api.post(`/api/workspace/invites/${inv.id}`, {}))}
                        style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text)', padding: '3px 8px', fontSize: 11, fontWeight: 600 }}
                      >
                        {busy === `resend:${inv.id}` ? 'Sending…' : 'Resend'}
                      </button>
                    )}
                    {manageable && (
                      <button
                        aria-label={`Revoke invite for ${inv.email}`}
                        disabled={busy === `revoke:${inv.id}`}
                        onClick={() => void run(`revoke:${inv.id}`, () => api.delete(`/api/workspace/invites/${inv.id}`))}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dim)', padding: 4 }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Viewer lock notice */}
        {!canAdmin && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--raised)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <Lock size={13} color="var(--dim)" />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Only admins can invite and manage team members</span>
          </div>
        )}
      </div>
    </div>
  )
}

function BillingTab() {
  const { canAdmin } = usePermission()
  if (!canAdmin) return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 40, boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
        <Lock size={28} color="var(--dim)" style={{ marginBottom: 14 }} />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Admin access required</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>Only workspace admins can view and manage billing.</p>
      </div>
    </div>
  )
  return <BillingTabContent />
}

const TIER_ORDER: PlanTier[] = ['free', 'starter', 'growth', 'enterprise']
const TIER_PRICE: Partial<Record<PlanTier, string>> = { free: '£0', starter: '£18', growth: '£49' }
const TIER_HIGHLIGHT: Partial<Record<PlanTier, string>> = { starter: 'Job descriptions', growth: 'Headcount planning' }

function tierName(tier: PlanTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

function describeTier(tier: PlanTier): string {
  const l = PLAN_LIMITS[tier]
  const n = (v: number, unit: string) => (v === UNLIMITED ? `Unlimited ${unit}` : `${v} ${unit}`)
  return [
    n(l.maxCharts, l.maxCharts === 1 ? 'chart' : 'charts'),
    n(l.maxNodesPerChart, 'nodes'),
    TIER_HIGHLIGHT[tier],
    n(l.seats, 'seats'),
  ].filter(Boolean).join(' · ')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** One line on where the subscription stands, or null when there is nothing to say. */
function subscriptionLine(sub: SubscriptionInfo): { text: string; tone: 'muted' | 'warn' } | null {
  if (sub.status === 'past_due') return { text: "Your last payment failed. We're retrying the card. Update your payment method to keep this plan.", tone: 'warn' }
  if (sub.status === 'unpaid') return { text: 'Your last payment failed, so this workspace is on Free. Pay the open invoice to restore your plan.', tone: 'warn' }
  if (sub.cancelAtPeriodEnd && sub.planExpiresAt) return { text: `Cancelled. Your plan stays active until ${formatDate(sub.planExpiresAt)}, then moves to Free.`, tone: 'warn' }
  if ((sub.status === 'active' || sub.status === 'trialing') && sub.planExpiresAt) return { text: `Renews on ${formatDate(sub.planExpiresAt)}.`, tone: 'muted' }
  return null
}

function BillingTabContent() {
  const navigate = useNavigate()
  const { currentTier } = usePlanLimits()
  const subscription = useBillingStore(s => s.subscription)
  const line = subscriptionLine(subscription)
  const upgrades = TIER_ORDER.filter(t => t !== 'enterprise' && TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(currentTier))
  const style: Partial<Record<PlanTier, { grad: string; glow: string }>> = {
    starter: { grad: 'var(--grad-brand)', glow: 'var(--brand-glow)' },
    growth:  { grad: 'var(--grad-purple)', glow: 'rgba(139,92,246,.3)' },
  }
  const price = TIER_PRICE[currentTier]
  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>Current plan</h3>
        <div style={{ background: 'var(--raised)', borderRadius: 12, padding: '18px 20px', border: '1px solid var(--border)', marginBottom: line || subscription.hasBillingAccount ? 14 : 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{tierName(currentTier)}</p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{describeTier(currentTier)}</p>
          </div>
          {price && (
            <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
              {price}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>/mo</span>
            </p>
          )}
        </div>
        {line && (
          <p role="status" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14, color: line.tone === 'warn' ? 'var(--warn)' : 'var(--muted)' }}>
            {line.text}
          </p>
        )}
        {subscription.hasBillingAccount && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <ManageBillingButton />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Change plan, update your card, cancel, or download invoices.</span>
          </div>
        )}
        {upgrades.map(t => (
          <button key={t} onClick={() => navigate('/pricing')} style={{
            width: '100%', padding: '12px 18px', background: style[t]?.grad, border: 'none',
            borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', marginBottom: 8, textAlign: 'left',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: `0 4px 14px ${style[t]?.glow}`,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Sparkles size={13} /> Upgrade to {tierName(t)}</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3 }}>{describeTier(t)}</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
              {TIER_PRICE[t]}<span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>/mo</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Switch({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
      style={{
        width: 42, height: 24, borderRadius: 12, flexShrink: 0,
        background: on ? 'var(--brand)' : 'var(--input-bg)',
        border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
        cursor: disabled ? 'default' : 'pointer', position: 'relative', transition: 'all .2s', opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
      }} />
    </button>
  )
}

function NotificationsTab() {
  // Only emails that exist are listed (roadmap 1.7: advertise only what works). Today that is comment emails
  // (roadmap 5), saved per person on the server. Approval, JD-status and invitation emails are not built, so there is
  // no switch for them; add one here when one of them is.
  const [commentEmails, setCommentEmails] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.get<{ comments: boolean }>('/api/notifications')
      .then(r => { if (alive) setCommentEmails(r.comments) })
      .catch(() => { if (alive) setError('Could not load your email settings.') })
    return () => { alive = false }
  }, [])

  async function toggleComments() {
    if (commentEmails === null) return
    const next = !commentEmails
    setCommentEmails(next)
    setError(null)
    try { await api.put('/api/notifications', { comments: next }) }
    catch { setCommentEmails(!next); setError('Could not save that. Please try again.') }
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 22 }}>Email notifications</h3>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, paddingRight: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>New comments</p>
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>When someone @mentions you or replies to your comment on a role</p>
          </div>
          <Switch on={commentEmails ?? true} disabled={commentEmails === null} label="New comments" onClick={() => void toggleComments()} />
        </div>
        {error && <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', margin: '12px 0 0' }}>{error}</p>}
      </div>
    </div>
  )
}
