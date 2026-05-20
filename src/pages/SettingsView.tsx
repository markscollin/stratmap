import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, Sparkles, X, Lock, ChevronDown, Check } from 'lucide-react'
import { useUserStore } from '../store/userStore'
import { usePermission } from '../hooks/usePermission'
import { usePlanLimits } from '../hooks/usePlanLimits'
import { api } from '../lib/apiClient'
import type { Permission } from '../types'

type Tab = 'general' | 'members' | 'billing' | 'notifications'

export function SettingsView() {
  const [tab, setTab] = useState<Tab>('general')
  return (
    <div style={{ padding: 32, animation: 'fadeUp .3s ease-out' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.4px' }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Manage your workspace and team</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
        {(['General','Members','Billing','Notifications'] as const).map(t => {
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
    </div>
  )
}

const ROLE_LABELS: Record<Permission, string> = {
  owner: 'Owner', admin: 'Admin', editor: 'Editor', commenter: 'Commenter', viewer: 'Viewer',
}
const ASSIGNABLE: Permission[] = ['admin', 'editor', 'commenter', 'viewer']

function MembersTab() {
  const { workspace, user, updateMemberPermission, removeMember, addPendingInvite, removePendingInvite } = useUserStore()
  const { canAdmin } = usePermission()
  const { currentTier } = usePlanLimits()
  const plan = (() => {
    const plans: Record<string, { seats: number; name: string }> = {
      free: { seats: 3, name: 'Free' },
      starter: { seats: 5, name: 'Starter' },
      growth: { seats: 10, name: 'Growth' },
      enterprise: { seats: 25, name: 'Enterprise' },
    }
    return plans[currentTier]
  })()
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Permission>('editor')
  const [inviteFocus, setInviteFocus] = useState(false)

  const members = workspace?.members ?? []
  const pending = workspace?.pendingInvites ?? []
  const seatsUsed = members.length
  const atLimit = seatsUsed >= plan.seats

  function handleSendInvite() {
    if (!inviteEmail.trim()) return
    addPendingInvite({ email: inviteEmail.trim(), permission: inviteRole, sentAt: new Date().toISOString() })
    setInviteEmail('')
    setInviteRole('editor')
    setShowInviteForm(false)
  }

  return (
    <div style={{ maxWidth: 580 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow-sm)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Team members</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {seatsUsed} of {plan.seats} seats used · {plan.name} plan
            </p>
          </div>
          {canAdmin && (
            <button
              onClick={() => setShowInviteForm(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Plus size={13} /> Invite
            </button>
          )}
        </div>

        {/* Seat usage bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ height: 4, borderRadius: 4, background: 'var(--raised)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 4, width: `${Math.min((seatsUsed / plan.seats) * 100, 100)}%`, background: atLimit ? 'var(--warn)' : 'var(--brand)', transition: 'width .3s' }} />
          </div>
          {atLimit && (
            <p style={{ fontSize: 11, color: 'var(--warn)', marginTop: 5 }}>
              All seats used. Additional seats are £4/month. <span style={{ color: 'var(--brand)', cursor: 'pointer' }}>Upgrade to add more</span>
            </p>
          )}
        </div>

        {/* Invite form */}
        {showInviteForm && (
          <div style={{ background: 'var(--raised)', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Invite a team member</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onFocus={() => setInviteFocus(true)}
                onBlur={() => setInviteFocus(false)}
                onKeyDown={e => e.key === 'Enter' && handleSendInvite()}
                style={{
                  flex: 1, padding: '8px 12px', background: 'var(--input-bg)',
                  border: `1px solid ${inviteFocus ? 'var(--brand)' : 'var(--border)'}`,
                  boxShadow: inviteFocus ? '0 0 0 3px var(--brand-bg)' : 'none',
                  borderRadius: 8, color: 'var(--text)', fontSize: 13, transition: 'all .15s',
                }}
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as Permission)}
                style={{ padding: '8px 10px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}
              >
                {ASSIGNABLE.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <button
                onClick={handleSendInvite}
                disabled={!inviteEmail.trim()}
                style={{ padding: '8px 16px', background: inviteEmail.trim() ? 'var(--grad-brand)' : 'var(--raised)', border: 'none', borderRadius: 8, color: inviteEmail.trim() ? '#fff' : 'var(--dim)', fontSize: 13, fontWeight: 600, cursor: inviteEmail.trim() ? 'pointer' : 'not-allowed' }}
              >
                Send
              </button>
              <button onClick={() => setShowInviteForm(false)} style={{ padding: '8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer' }}>
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Member list */}
        {members.length === 0 ? (
          <div style={{ background: 'var(--raised)', borderRadius: 10, padding: '28px 20px', textAlign: 'center', border: '1px dashed var(--border)' }}>
            <Users size={22} color="var(--dim)" style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 4 }}>No team members yet</p>
            <p style={{ fontSize: 12, color: 'var(--dim)' }}>Invite colleagues — they'll get a link to join your workspace</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {members.map(m => {
              const initials = m.user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
              const isCurrentUser = m.user.id === user?.id
              const canChange = canAdmin && !isCurrentUser && m.permission !== 'owner'
              return (
                <div key={m.user.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--raised)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {m.user.name} {isCurrentUser && <span style={{ fontSize: 11, color: 'var(--muted)' }}>(you)</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{m.user.email}</div>
                  </div>
                  {canChange ? (
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <select
                        value={m.permission}
                        onChange={e => updateMemberPermission(m.user.id, e.target.value as Permission)}
                        style={{ appearance: 'none', padding: '4px 24px 4px 10px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}
                      >
                        {ASSIGNABLE.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                      <ChevronDown size={11} style={{ position: 'absolute', right: 7, pointerEvents: 'none', color: 'var(--muted)' }} />
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 10px', background: 'var(--nav-hover)', borderRadius: 6 }}>
                      {ROLE_LABELS[m.permission]}
                    </span>
                  )}
                  {canChange && (
                    <button onClick={() => removeMember(m.user.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dim)', padding: 4, display: 'flex', alignItems: 'center' }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pending invites */}
        {pending.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Pending invites</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {pending.map(inv => (
                <div key={inv.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 10, background: 'var(--raised)', border: '1px dashed var(--border)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--nav-hover)', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Users size={14} color="var(--dim)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>{inv.email}</div>
                    <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 1 }}>Invited as {ROLE_LABELS[inv.permission]}</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '3px 8px', borderRadius: 20 }}>Pending</span>
                  {canAdmin && (
                    <button onClick={() => removePendingInvite(inv.email)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dim)', padding: 4 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
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

function BillingTabContent() {
  const navigate = useNavigate()
  const plans = [
    { label: 'Starter', price: '£18', desc: '5 charts · 100 nodes · JD management · 5 seats', grad: 'var(--grad-brand)',  glow: 'var(--brand-glow)' },
    { label: 'Growth',  price: '£49', desc: 'Unlimited charts · Headcount · AI drafting · 10 seats', grad: 'var(--grad-purple)', glow: 'rgba(139,92,246,.3)' },
  ]
  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>Current plan</h3>
        <div style={{ background: 'var(--raised)', borderRadius: 12, padding: '18px 20px', border: '1px solid var(--border)', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Free</p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>1 chart · 30 nodes · 3 collaborators</p>
          </div>
          <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
            £0<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>/mo</span>
          </p>
        </div>
        {plans.map(({ label, price, desc, grad, glow }) => (
          <button key={label} onClick={() => navigate('/pricing')} style={{
            width: '100%', padding: '12px 18px', background: grad, border: 'none',
            borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', marginBottom: 8, textAlign: 'left',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: `0 4px 14px ${glow}`,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Sparkles size={13} /> Upgrade to {label}</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3 }}>{desc}</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
              {price}<span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>/mo</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function NotificationsTab() {
  const [notifs, setNotifs] = useState({ approvals: true, jd: true, comments: false, invites: true })
  type NotifKey = keyof typeof notifs
  const items: { id: NotifKey; label: string; desc: string }[] = [
    { id: 'approvals', label: 'Approval requests',   desc: 'When someone requests your approval' },
    { id: 'jd',        label: 'JD status changes',   desc: 'When a job description moves through the workflow' },
    { id: 'comments',  label: 'New comments',         desc: 'When someone @mentions you' },
    { id: 'invites',   label: 'Team invitations',     desc: 'When someone joins your workspace' },
  ]
  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 22 }}>Email notifications</h3>
        {items.map(({ id, label, desc }) => (
          <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 18, marginBottom: 18, borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1, paddingRight: 20 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>{label}</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{desc}</p>
            </div>
            <button
              onClick={() => setNotifs(n => ({ ...n, [id]: !n[id] }))}
              style={{
                width: 42, height: 24, borderRadius: 12, flexShrink: 0,
                background: notifs[id] ? 'var(--brand)' : 'var(--input-bg)',
                border: `1px solid ${notifs[id] ? 'var(--brand)' : 'var(--border)'}`,
                cursor: 'pointer', position: 'relative', transition: 'all .2s',
              }}
            >
              <div style={{
                position: 'absolute', top: 3,
                left: notifs[id] ? 21 : 3,
                width: 16, height: 16, borderRadius: '50%',
                background: '#fff', transition: 'left .2s',
                boxShadow: '0 1px 3px rgba(0,0,0,.2)',
              }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
