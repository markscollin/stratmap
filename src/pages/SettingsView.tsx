import { useState } from 'react'
import { Plus, Users, Sparkles } from 'lucide-react'

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
  const [wName, setWName] = useState('')
  const [email, setEmail] = useState('')
  const [focus, setFocus] = useState<string | null>(null)
  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 22 }}>Workspace</h3>
        <FocusInput id="name"  label="Workspace name" type="text"  placeholder="My Organisation" value={wName} onChange={setWName} focus={focus} setFocus={setFocus} />
        <FocusInput id="email" label="Primary email"  type="email" placeholder="you@company.com"  value={email} onChange={setEmail} focus={focus} setFocus={setFocus} />
        <button style={{ padding: '9px 20px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Save changes
        </button>
      </div>
    </div>
  )
}

function MembersTab() {
  return (
    <div style={{ maxWidth: 580 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Team members</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Free plan · 3 seats included</p>
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={13} /> Invite
          </button>
        </div>
        <div style={{ background: 'var(--raised)', borderRadius: 10, padding: '28px 20px', textAlign: 'center', border: '1px dashed var(--border)' }}>
          <Users size={22} color="var(--dim)" style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 4 }}>No team members yet</p>
          <p style={{ fontSize: 12, color: 'var(--dim)' }}>Invite colleagues — they'll get a link to join your workspace</p>
        </div>
      </div>
    </div>
  )
}

function BillingTab() {
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
          <button key={label} style={{
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
