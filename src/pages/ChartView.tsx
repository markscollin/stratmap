import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, X, MoreHorizontal, UserCircle, Calendar, Users, Building2,
  Clock, ExternalLink, Copy, GitBranch, Trash2,
} from 'lucide-react'
import { useChartStore } from '../store'
import { CHART_DISPLAY } from '../data/mockOrg'
import { STATUS_META, STATUS_ACTIONS } from '../constants/statusMeta'
import { StatusBadge } from '../components/ui/StatusBadge'
import { VersionPill } from '../components/ui/VersionPill'
import { AvatarStack } from '../components/ui/AvatarStack'
import { MiniChartThumb } from '../components/ui/MiniChartThumb'
import { UpgradeModal } from '../components/ui/UpgradeModal'
import { usePermission } from '../hooks/usePermission'
import { usePlanLimits } from '../hooks/usePlanLimits'
import type { OrgChart, OrgNode, OrgEdge, ChartStatus } from '../types'
import { mockDepartments } from '../data/mockOrg'

const PERMISSION_RANK: Record<string, number> = { owner: 5, admin: 4, editor: 3, commenter: 2, viewer: 1 }

// ── Approval cycle bar ────────────────────────────────────────────────────────

const CYCLE_STEPS: { key: ChartStatus; arrow: boolean; branch?: boolean }[] = [
  { key: 'draft',    arrow: false },
  { key: 'editing',  arrow: true  },
  { key: 'review',   arrow: true  },
  { key: 'rejected', arrow: false, branch: true },
  { key: 'approved', arrow: true  },
  { key: 'live',     arrow: true  },
]

function ApprovalCycleBar({
  statusFilter, counts, onFilter,
}: {
  statusFilter: ChartStatus | 'all'
  counts: Record<string, number>
  onFilter: (s: ChartStatus | 'all') => void
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, boxShadow: 'var(--shadow-sm)' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px', marginRight: 10 }}>Approval cycle</span>
      {CYCLE_STEPS.map(({ key, arrow, branch }) => {
        const m = STATUS_META[key]
        const Icon = m.Icon
        const active = statusFilter === key
        const count = counts[key] || 0
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => onFilter(active ? 'all' : key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, background: active ? m.bg : 'transparent', border: `1px solid ${active ? m.color : 'transparent'}`, color: active ? m.color : 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}
            >
              <Icon size={10} />{m.label}
              {count > 0 && <span style={{ background: m.bg, color: m.color, borderRadius: 8, padding: '0 4px', fontSize: 10 }}>{count}</span>}
            </button>
            {branch && <span style={{ fontSize: 11, color: 'var(--dim)', margin: '0 2px' }}>↩</span>}
            {arrow && !branch && <span style={{ fontSize: 11, color: 'var(--dim)', margin: '0 1px' }}>→</span>}
          </div>
        )
      })}
      <span style={{ fontSize: 11, color: 'var(--dim)', margin: '0 6px' }}>·</span>
      {(() => {
        const m = STATUS_META['archived']
        const Icon = m.Icon
        const active = statusFilter === 'archived'
        const count = counts['archived'] || 0
        return (
          <button
            onClick={() => onFilter(active ? 'all' : 'archived')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, background: active ? m.bg : 'transparent', border: `1px solid ${active ? m.color : 'transparent'}`, color: active ? m.color : 'var(--dim)', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}
          >
            <Icon size={10} />{m.label}
            {count > 0 && <span style={{ background: m.bg, color: m.color, borderRadius: 8, padding: '0 4px', fontSize: 10 }}>{count}</span>}
          </button>
        )
      })()}
    </div>
  )
}

// ── Chart card ────────────────────────────────────────────────────────────────

function ChartCard({ chart, index, onAction, canEdit: _canEdit, canAdmin }: {
  chart: OrgChart
  index: number
  onAction: (id: string, next: ChartStatus) => void
  canEdit: boolean
  canAdmin: boolean
}) {
  const [hov, setHov]               = useState(false)
  const [menu, setMenu]             = useState(false)
  const [confirmDelete, setConfirm] = useState(false)
  const navigate                    = useNavigate()
  const { duplicateChart, deleteChart } = useChartStore()
  const { permission } = usePermission()
  const actions = (STATUS_ACTIONS[chart.status] || []).filter(
    a => PERMISSION_RANK[permission] >= PERMISSION_RANK[a.minPermission]
  )
  const display = CHART_DISPLAY[chart.id] ?? { nodeCount: chart.nodes.length, deptCount: chart.departments.length, updatedDisplay: chart.updatedAt }

  const metaItems = [
    { Icon: UserCircle, label: chart.owner },
    { Icon: Calendar,   label: display.updatedDisplay },
    { Icon: Users,      label: `${display.nodeCount} nodes` },
    { Icon: Building2,  label: `${display.deptCount} depts` },
  ]

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setMenu(false) }}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${hov ? 'var(--border-hover)' : 'var(--border)'}`,
        borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
        boxShadow: hov ? 'var(--shadow)' : 'var(--shadow-sm)',
        transform: hov ? 'translateY(-2px)' : 'none',
        transition: 'all .2s cubic-bezier(.4,0,.2,1)',
        animation: `cardIn .3s ease-out ${index * 0.05}s both`,
      }}
    >
      {/* Thumbnail */}
      <div
        onClick={() => navigate(`/charts/${chart.id}`)}
        style={{ height: 108, background: 'var(--bg)', position: 'relative', borderBottom: '1px solid var(--border)', padding: 10, overflow: 'hidden' }}
      >
        <div style={{ position: 'absolute', inset: 14 }}><MiniChartThumb id={chart.id} /></div>
        {chart.status === 'live' && (
          <div style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: '50%', background: '#10B981', animation: 'livePulse 2s ease-in-out infinite' }} />
        )}
        {chart.status === 'rejected' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(239,68,68,0.05)', borderBottom: '1px solid rgba(239,68,68,0.15)' }} />
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '14px 16px' }}>
        {/* Title + menu */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <h3
            onClick={() => navigate(`/charts/${chart.id}`)}
            style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4, flex: 1 }}
          >{chart.name}</h3>
          <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button
              data-testid="chart-overflow-btn"
              onClick={() => setMenu(!menu)}
              style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${menu ? 'var(--border-hover)' : 'transparent'}`, background: menu ? 'var(--raised)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted)' }}
            >
              <MoreHorizontal size={13} />
            </button>
            {menu && !confirmDelete && (
              <OverflowMenu
                actions={actions}
                canAdmin={canAdmin}
                onAction={next => { onAction(chart.id, next); setMenu(false) }}
                onOpen={() => { navigate(`/charts/${chart.id}`); setMenu(false) }}
                onDuplicate={() => { duplicateChart(chart.id); setMenu(false) }}
                onDelete={() => { setConfirm(true); setMenu(false) }}
                onClose={() => setMenu(false)}
              />
            )}
            {confirmDelete && (
              <div data-testid="chart-delete-confirm" style={{ position: 'absolute', top: 30, right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border-hover)', borderRadius: 10, padding: '14px 16px', minWidth: 220, boxShadow: 'var(--shadow)', animation: 'slideDown .15s ease-out' }}>
                <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 12, lineHeight: 1.4 }}>Delete <strong>{chart.name}</strong>? This cannot be undone.</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setConfirm(false)} style={{ flex: 1, padding: '6px', fontSize: 12, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={() => { deleteChart(chart.id); setConfirm(false) }} style={{ flex: 1, padding: '6px', fontSize: 12, fontWeight: 600, background: 'var(--danger)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <StatusBadge status={chart.status} />
          <VersionPill version={chart.version} />
        </div>

        {/* Meta grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 6, marginBottom: 12 }}>
          {metaItems.map(({ Icon, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon size={11} color="var(--dim)" />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <AvatarStack initials={chart.collaborators} />
          <span style={{ fontSize: 11, color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} />{display.updatedDisplay}
          </span>
        </div>
      </div>
    </div>
  )
}

function OverflowMenu({ actions, canAdmin, onAction, onOpen, onDuplicate, onDelete, onClose }: {
  actions: { next: ChartStatus; label: string; color: string }[]
  canAdmin: boolean
  onAction: (next: ChartStatus) => void
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const secondaryItems = [
    { Icon: ExternalLink, label: 'Open chart',   color: 'var(--text)',    fn: onOpen },
    { Icon: Copy,         label: 'Duplicate',    color: 'var(--text)',    fn: onDuplicate },
    { Icon: GitBranch,    label: 'New scenario', color: 'var(--text)',    fn: onClose },
    ...(canAdmin ? [{ Icon: Trash2, label: 'Delete', color: 'var(--danger)', fn: onDelete }] : []),
  ]
  return (
    <div style={{ position: 'absolute', top: 30, right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border-hover)', borderRadius: 10, padding: 5, minWidth: 190, boxShadow: 'var(--shadow)', animation: 'slideDown .15s ease-out' }}>
      {actions.length > 0 && (
        <>
          {actions.map(a => (
            <MenuBtn key={a.next} color={a.color} label={a.label} onClick={() => onAction(a.next)} bold />
          ))}
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
        </>
      )}
      {secondaryItems.map(({ Icon, label, color, fn }) => (
        <button key={label} onClick={fn}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', background: 'transparent', border: 'none', borderRadius: 6, color, fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--raised)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Icon size={12} />{label}
        </button>
      ))}
    </div>
  )
}

function MenuBtn({ label, color, onClick, bold }: { label: string; color: string; onClick: () => void; bold?: boolean }) {
  return (
    <button onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: 'transparent', border: 'none', borderRadius: 6, color, fontSize: 13, fontWeight: bold ? 600 : 400, cursor: 'pointer', textAlign: 'left' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--raised)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >{label}</button>
  )
}

// ── New chart modal ───────────────────────────────────────────────────────────

function NewChartModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (name: string, template: string) => void
}) {
  const [name, setName]         = useState('')
  const [template, setTemplate] = useState('blank')
  const [focus, setFocus]       = useState(false)

  const templates = [
    { id: 'blank',   label: 'Blank',       desc: 'Start from scratch' },
    { id: 'startup', label: 'Startup',     desc: '10–30 people, flat' },
    { id: 'scaleup', label: 'Scale-up',    desc: 'Functional departments' },
    { id: 'hiring',  label: 'Hiring plan', desc: 'Open roles and planned hires' },
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: 20, border: '1px solid var(--border-hover)', padding: 32, width: 460, boxShadow: 'var(--shadow)', animation: 'nodePop .25s cubic-bezier(.34,1.56,.64,1)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.3px' }}>New org chart</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 7 }}>Chart name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder="e.g. Q3 Hiring Plan, Current Structure…"
            style={{ width: '100%', padding: '10px 13px', background: 'var(--input-bg)', border: `1px solid ${focus ? 'var(--brand)' : 'var(--border)'}`, boxShadow: focus ? '0 0 0 3px var(--brand-bg)' : 'none', borderRadius: 9, color: 'var(--text)', fontSize: 14, transition: 'all .15s' }}
          />
        </div>

        <div style={{ marginBottom: 28 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Template</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {templates.map(tmpl => (
              <button
                key={tmpl.id}
                onClick={() => setTemplate(tmpl.id)}
                style={{ padding: '11px 13px', textAlign: 'left', background: template === tmpl.id ? 'var(--brand-bg)' : 'var(--raised)', border: `1px solid ${template === tmpl.id ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 9, cursor: 'pointer', transition: 'all .15s' }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: template === tmpl.id ? 'var(--brand)' : 'var(--text)', marginBottom: 2 }}>{tmpl.label}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{tmpl.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--muted)', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={() => { if (name.trim()) onCreate(name.trim(), template) }}
            style={{ flex: 2, padding: '11px', background: name.trim() ? 'var(--grad-brand)' : 'var(--raised)', border: 'none', borderRadius: 9, color: name.trim() ? '#fff' : 'var(--dim)', fontSize: 14, fontWeight: 600, cursor: name.trim() ? 'pointer' : 'default', transition: 'all .2s', boxShadow: name.trim() ? '0 4px 14px var(--brand-glow)' : 'none' }}
          >
            Create chart
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Template starters ─────────────────────────────────────────────────────────

function makeTemplateData(template: string): { nodes: OrgNode[]; edges: OrgEdge[] } {
  if (template === 'blank') return { nodes: [], edges: [] }

  const t = Date.now()
  const id = (n: number) => `n${t}${n}`
  const eid = (n: number) => `e${t}${n}`

  if (template === 'startup') {
    // Flat 5-node startup: CEO + 4 leads
    const nodes: OrgNode[] = [
      { id: id(0), name: 'Founder',        title: 'CEO',              departmentId: 'eng',     managerId: null,  status: 'active', employmentType: 'full-time', x: 390, y: 50  },
      { id: id(1), name: 'Engineering Lead', title: 'CTO',            departmentId: 'eng',     managerId: id(0), status: 'active', employmentType: 'full-time', x: 60,  y: 220 },
      { id: id(2), name: 'Product Lead',   title: 'Head of Product',  departmentId: 'product', managerId: id(0), status: 'active', employmentType: 'full-time', x: 280, y: 220 },
      { id: id(3), name: 'Design Lead',    title: 'Head of Design',   departmentId: 'design',  managerId: id(0), status: 'active', employmentType: 'full-time', x: 500, y: 220 },
      { id: id(4), name: 'Sales Lead',     title: 'VP Sales',         departmentId: 'go',      managerId: id(0), status: 'active', employmentType: 'full-time', x: 720, y: 220 },
    ]
    const edges: OrgEdge[] = [
      { id: eid(1), sourceId: id(0), targetId: id(1) },
      { id: eid(2), sourceId: id(0), targetId: id(2) },
      { id: eid(3), sourceId: id(0), targetId: id(3) },
      { id: eid(4), sourceId: id(0), targetId: id(4) },
    ]
    return { nodes, edges }
  }

  if (template === 'scaleup') {
    // Functional departments: CEO → CTO/CPO/VP GTM/CFO, each with 2–3 ICs
    const nodes: OrgNode[] = [
      { id: id(0),  name: 'Sarah Chen',   title: 'Chief Executive Officer',  departmentId: 'eng',     managerId: null,  status: 'active', employmentType: 'full-time', x: 980,  y: 50  },
      { id: id(1),  name: 'Jamie Davies', title: 'Chief Technology Officer',  departmentId: 'eng',     managerId: id(0), status: 'active', employmentType: 'full-time', x: 240,  y: 220 },
      { id: id(2),  name: 'Mark Kim',     title: 'Chief Product Officer',     departmentId: 'product', managerId: id(0), status: 'active', employmentType: 'full-time', x: 800,  y: 220 },
      { id: id(3),  name: 'Ryan Obi',     title: 'VP Go-to-Market',           departmentId: 'go',      managerId: id(0), status: 'active', employmentType: 'full-time', x: 1290, y: 220 },
      { id: id(4),  name: 'Chris Park',   title: 'Finance Manager',           departmentId: 'finance', managerId: id(0), status: 'active', employmentType: 'full-time', x: 1690, y: 220 },
      { id: id(5),  name: 'Alex Chen',    title: 'Senior Software Engineer',  departmentId: 'eng',     managerId: id(1), status: 'active', employmentType: 'full-time', x: 20,   y: 400 },
      { id: id(6),  name: 'Priya Nair',   title: 'Senior Software Engineer',  departmentId: 'eng',     managerId: id(1), status: 'active', employmentType: 'full-time', x: 240,  y: 400 },
      { id: id(7),  name: 'Software Engineer', title: 'Software Engineer',    departmentId: 'eng',     managerId: id(1), status: 'open',   employmentType: 'full-time', x: 460,  y: 400 },
      { id: id(8),  name: 'Lisa Park',    title: 'Product Manager',           departmentId: 'product', managerId: id(2), status: 'active', employmentType: 'full-time', x: 720,  y: 400 },
      { id: id(9),  name: 'Product Manager', title: 'Product Manager',        departmentId: 'product', managerId: id(2), status: 'open',   employmentType: 'full-time', x: 940,  y: 400 },
      { id: id(10), name: 'Amy Walsh',    title: 'Sales Development Rep',     departmentId: 'go',      managerId: id(3), status: 'active', employmentType: 'full-time', x: 1210, y: 400 },
      { id: id(11), name: 'Jack Bell',    title: 'Sales Development Rep',     departmentId: 'go',      managerId: id(3), status: 'active', employmentType: 'full-time', x: 1430, y: 400 },
      { id: id(12), name: 'Finance Analyst', title: 'Finance Analyst',        departmentId: 'finance', managerId: id(4), status: 'planned',employmentType: 'full-time', x: 1710, y: 400 },
    ]
    const edges: OrgEdge[] = [
      { id: eid(1),  sourceId: id(0), targetId: id(1)  },
      { id: eid(2),  sourceId: id(0), targetId: id(2)  },
      { id: eid(3),  sourceId: id(0), targetId: id(3)  },
      { id: eid(4),  sourceId: id(0), targetId: id(4)  },
      { id: eid(5),  sourceId: id(1), targetId: id(5)  },
      { id: eid(6),  sourceId: id(1), targetId: id(6)  },
      { id: eid(7),  sourceId: id(1), targetId: id(7)  },
      { id: eid(8),  sourceId: id(2), targetId: id(8)  },
      { id: eid(9),  sourceId: id(2), targetId: id(9)  },
      { id: eid(10), sourceId: id(3), targetId: id(10) },
      { id: eid(11), sourceId: id(3), targetId: id(11) },
      { id: eid(12), sourceId: id(4), targetId: id(12) },
    ]
    return { nodes, edges }
  }

  if (template === 'hiring') {
    // Hiring plan: active backbone + open/planned roles
    const nodes: OrgNode[] = [
      { id: id(0), name: 'CEO',                title: 'Chief Executive Officer', departmentId: 'eng',     managerId: null,  status: 'active',  employmentType: 'full-time', x: 490, y: 50  },
      { id: id(1), name: 'Engineering Lead',   title: 'Head of Engineering',     departmentId: 'eng',     managerId: id(0), status: 'active',  employmentType: 'full-time', x: 60,  y: 220 },
      { id: id(2), name: 'Head of Product',    title: 'Head of Product',         departmentId: 'product', managerId: id(0), status: 'open',    employmentType: 'full-time', x: 280, y: 220 },
      { id: id(3), name: 'Head of Marketing',  title: 'VP Marketing',            departmentId: 'go',      managerId: id(0), status: 'planned', employmentType: 'full-time', x: 500, y: 220 },
      { id: id(4), name: 'Head of Operations', title: 'VP Operations',           departmentId: 'ops',     managerId: id(0), status: 'planned', employmentType: 'full-time', x: 720, y: 220 },
      { id: id(5), name: 'Senior Engineer',    title: 'Senior Software Engineer',departmentId: 'eng',     managerId: id(1), status: 'active',  employmentType: 'full-time', x: 20,  y: 400 },
      { id: id(6), name: 'Engineer',           title: 'Software Engineer',       departmentId: 'eng',     managerId: id(1), status: 'open',    employmentType: 'full-time', x: 240, y: 400 },
      { id: id(7), name: 'Engineer',           title: 'Software Engineer',       departmentId: 'eng',     managerId: id(1), status: 'open',    employmentType: 'full-time', x: 460, y: 400 }, // correction: not backfill, open
    ]
    const edges: OrgEdge[] = [
      { id: eid(1), sourceId: id(0), targetId: id(1) },
      { id: eid(2), sourceId: id(0), targetId: id(2) },
      { id: eid(3), sourceId: id(0), targetId: id(3) },
      { id: eid(4), sourceId: id(0), targetId: id(4) },
      { id: eid(5), sourceId: id(1), targetId: id(5) },
      { id: eid(6), sourceId: id(1), targetId: id(6) },
      { id: eid(7), sourceId: id(1), targetId: id(7) },
    ]
    return { nodes, edges }
  }

  return { nodes: [], edges: [] }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ChartView() {
  const { charts, loading, loaded, fetchCharts, createChart, updateChartStatus } = useChartStore()
  const navigate = useNavigate()
  const { canEdit, canAdmin } = usePermission()
  const { isAtChartLimit, currentTier } = usePlanLimits()
  const [search, setSearch]         = useState('')
  const [statusFilter, setFilter]   = useState<ChartStatus | 'all'>('all')
  const [showModal, setShowModal]   = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  useEffect(() => { document.title = 'StratMap — Org Charts' }, [])
  useEffect(() => { if (!loaded) fetchCharts() }, [loaded, fetchCharts])
  const [focusSearch, setFocusSearch] = useState(false)

  const filtered = charts
    .filter(c => statusFilter === 'all' || c.status === statusFilter)
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.owner.toLowerCase().includes(search.toLowerCase()))

  const statusCounts = charts.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {})

  const handleCreate = async (name: string, template: string) => {
    const { nodes, edges } = makeTemplateData(template)
    const chart = await createChart(name, nodes, edges, mockDepartments)
    if (chart) {
      setShowModal(false)
      navigate(`/charts/${chart.id}`)
    }
  }

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeUp .3s ease-out' }}>
      {showModal && <NewChartModal onClose={() => setShowModal(false)} onCreate={handleCreate} />}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onUpgrade={() => navigate('/pricing')}
        feature="More org charts"
        requiredTier="starter"
        currentTier={currentTier}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: 4 }}>Org Charts</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>{loading ? 'Loading…' : `${charts.length} charts in your workspace`}</p>
            {currentTier === 'free' && (
              <p style={{ fontSize: 12, color: 'var(--dim)', background: 'var(--raised)', padding: '4px 10px', borderRadius: 6 }}>
                {charts.length} of 1 chart
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ padding: '9px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>Import CSV</button>
          {canEdit && (
            <button
              onClick={() => {
                if (isAtChartLimit()) {
                  setShowUpgradeModal(true)
                } else {
                  setShowModal(true)
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px var(--brand-glow)' }}
            >
              <Plus size={14} /> New chart
            </button>
          )}
        </div>
      </div>

      <ApprovalCycleBar statusFilter={statusFilter} counts={statusCounts} onFilter={setFilter} />

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: `1px solid ${focusSearch ? 'var(--brand)' : 'var(--border)'}`, boxShadow: focusSearch ? '0 0 0 3px var(--brand-bg)' : 'none', borderRadius: 8, padding: '7px 12px', width: 240, transition: 'all .15s' }}>
          <Search size={13} color="var(--dim)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setFocusSearch(true)}
            onBlur={() => setFocusSearch(false)}
            placeholder="Search by name or owner…"
            style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13, flex: 1, width: '100%' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dim)', display: 'flex' }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '64px 40px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Search size={22} color="var(--brand)" />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            {search ? `No charts matching "${search}"` : 'No charts yet'}
          </h3>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.7, maxWidth: 380, margin: '0 auto 24px' }}>
            {search ? 'Try a different search or clear the filter.' : 'Create your first org chart.'}
          </p>
          {!search && canEdit && (
            <button
              onClick={() => {
                if (isAtChartLimit()) {
                  setShowUpgradeModal(true)
                } else {
                  setShowModal(true)
                }
              }}
              style={{ padding: '10px 22px', background: 'var(--grad-brand)', border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px var(--brand-glow)' }}
            >
              Create your first chart
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(252px, 1fr))', gap: 14 }}>
            {filtered.map((chart, i) => (
              <ChartCard
                key={chart.id}
                chart={chart}
                index={i}
                onAction={(id, next) => updateChartStatus(id, next)}
                canEdit={canEdit}
                canAdmin={canAdmin}
              />
            ))}
            {canEdit && (
              <NewChartTile
                onClick={() => {
                  if (isAtChartLimit()) {
                    setShowUpgradeModal(true)
                  } else {
                    setShowModal(true)
                  }
                }}
              />
            )}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--dim)' }}>
              {filtered.length === charts.length ? `${charts.length} charts total` : `Showing ${filtered.length} of ${charts.length}`}
            </span>
            <div style={{ display: 'flex', gap: 5 }}>
              {(Object.entries(statusCounts) as [ChartStatus, number][]).map(([status, count]) => {
                const m = STATUS_META[status]
                if (!m) return null
                return <span key={status} style={{ fontSize: 11, color: m.color, background: m.bg, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{count} {m.label}</span>
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function NewChartTile({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        border: `2px dashed ${hov ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 16, background: 'transparent', cursor: 'pointer',
        minHeight: 200, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 10,
        color: hov ? 'var(--brand)' : 'var(--dim)', transition: 'all .2s',
      }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 9, border: '1.5px dashed currentColor', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Plus size={16} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 500 }}>New chart</span>
    </button>
  )
}
