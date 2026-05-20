import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Briefcase, TrendingUp, Network, ArrowRight, Plus, BarChart2 } from 'lucide-react'
import { useChartStore } from '../store'
import { useHeadcountStore } from '../store/headcountStore'
import { STATUS_META } from '../constants/statusMeta'
import { api } from '../lib/apiClient'
import type { ChartStatus } from '../types'

interface DeptStat {
  id: string
  name: string
  colour: string
  headcount: number
  open: number
}

interface RoleTypeBreakdown {
  'new-headcount': number
  backfill: number
  contractor: number
  tbd: number
}

interface WorkspaceStats {
  totalHeadcount: number
  totalOpen: number
  deptBreakdown: DeptStat[]
  roleTypeBreakdown: RoleTypeBreakdown
}

export function Dashboard() {
  const navigate = useNavigate()
  const { charts } = useChartStore()
  const { plans, fetch: fetchPlans } = useHeadcountStore()

  const [stats, setStats] = useState<WorkspaceStats | null>(null)

  useEffect(() => {
    document.title = 'StratMap — Dashboard'
    fetchPlans()
    api.get<WorkspaceStats>('/api/workspace/stats')
      .then(setStats)
      .catch(err => console.error('[Dashboard] stats fetch failed:', err))
  }, []) // eslint-disable-line

  const totalHeadcount = stats?.totalHeadcount ?? 0
  const totalOpen      = stats?.totalOpen ?? 0
  const liveCharts     = charts.filter(c => c.status === 'live').length
  const plannedHires   = plans.filter(p => p.status !== 'filled').length
  const deptBreakdown  = stats?.deptBreakdown ?? []

  const nodeTotal = totalHeadcount + totalOpen + plannedHires
  const nodePipeline = [
    { label: 'Active',  count: totalHeadcount, color: 'var(--success)', pct: nodeTotal ? Math.round(totalHeadcount / nodeTotal * 100) : 0 },
    { label: 'Open',    count: totalOpen,       color: 'var(--warn)',    pct: nodeTotal ? Math.round(totalOpen / nodeTotal * 100) : 0 },
    { label: 'Planned', count: plannedHires,    color: 'var(--purple)', pct: nodeTotal ? Math.round(plannedHires / nodeTotal * 100) : 0 },
  ]

  const chartStatusCounts = charts.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {})

  const kpis = [
    { label: 'Total headcount', value: totalHeadcount, sub: 'active roles in live charts',   color: 'var(--brand)',   bg: 'var(--brand-bg)',   Icon: Users,      grad: 'var(--grad-brand)' },
    { label: 'Open roles',      value: totalOpen,       sub: 'unfilled positions',             color: 'var(--warn)',    bg: 'var(--warn-bg)',    Icon: Briefcase,  grad: 'var(--grad-warn)' },
    { label: 'Planned hires',   value: plannedHires,    sub: 'in headcount plan',              color: 'var(--purple)', bg: 'var(--purple-bg)', Icon: TrendingUp, grad: 'var(--grad-purple)' },
    { label: 'Live org charts', value: liveCharts,      sub: 'currently published',            color: 'var(--success)',bg: 'var(--success-bg)',Icon: Network,    grad: 'var(--grad-success)' },
  ]

  const quickActions = [
    { label: 'New org chart',   Icon: Plus,      color: 'var(--brand)',   bg: 'var(--brand-bg)',   path: '/charts' },
    { label: 'Add a role',      Icon: Briefcase, color: 'var(--purple)',  bg: 'var(--purple-bg)',  path: '/roles' },
    { label: 'Invite teammate', Icon: Users,     color: 'var(--success)', bg: 'var(--success-bg)', path: '/settings' },
    { label: 'View headcount',  Icon: BarChart2, color: 'var(--warn)',    bg: 'var(--warn-bg)',    path: '/headcount' },
  ]

  const isLoading = !stats

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeUp .3s ease-out' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: 4 }}>
          Org Health
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>A snapshot of your organisation as of today</p>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {kpis.map(({ label, value, sub, color, bg, Icon }) => (
          <div key={label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '20px 22px',
            boxShadow: 'var(--shadow-sm)', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -12, right: -12, width: 72, height: 72, borderRadius: '50%', background: bg, opacity: 0.6 }} />
            <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon size={18} color={color} />
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: isLoading ? 'var(--dim)' : 'var(--text)', lineHeight: 1, letterSpacing: '-1px', marginBottom: 4 }}>
              {isLoading ? '—' : value}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Main 2-col section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Department breakdown */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Departments</h2>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Headcount and open roles in live charts</p>
            </div>
            <button
              onClick={() => navigate('/charts')}
              style={{ fontSize: 12, color: 'var(--brand)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              View charts <ArrowRight size={12} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {isLoading ? (
              [1, 2, 3].map(i => (
                <div key={i} style={{ height: 36, background: 'var(--raised)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))
            ) : deptBreakdown.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--dim)', textAlign: 'center', padding: '16px 0' }}>
                No live charts yet. Publish a chart to see department data.
              </p>
            ) : (
              deptBreakdown.map(d => {
                const total = d.headcount + d.open
                const hcPct = total ? Math.round((d.headcount / total) * 100) : 0
                return (
                  <div key={d.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: d.colour, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{d.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{d.headcount} active</span>
                        {d.open > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--warn)', background: 'var(--warn-bg)', padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>
                            +{d.open} open
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ height: 6, background: 'var(--raised)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', height: '100%' }}>
                        <div style={{ width: `${hcPct}%`, background: d.colour, borderRadius: 3, transition: 'width .6s ease-out' }} />
                        <div style={{ flex: 1, background: `${d.colour}30` }} />
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Role pipeline */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-sm)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Role pipeline</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>Across your live org charts</p>
            <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
              {nodePipeline.map(({ color, pct }, i) => (
                <div key={i} style={{ width: `${pct}%`, background: color, transition: 'width .6s ease-out' }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {nodePipeline.map(({ label, count, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{count}</span>
                </div>
              ))}
            </div>

            {stats?.roleTypeBreakdown && <RoleTypeBreakdown breakdown={stats.roleTypeBreakdown} />}
          </div>

          {/* Chart status summary */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Org charts</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>By approval status</p>
              </div>
              <button
                onClick={() => navigate('/charts')}
                style={{ fontSize: 12, color: 'var(--brand)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                Manage <ArrowRight size={12} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.keys(chartStatusCounts).length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--dim)', textAlign: 'center', padding: '12px 0' }}>No charts yet</p>
              ) : (
                (Object.entries(chartStatusCounts) as [ChartStatus, number][]).map(([status, count]) => {
                  const m = STATUS_META[status]
                  if (!m) return null
                  const Icon = m.Icon
                  return (
                    <div key={status} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', background: 'var(--raised)', borderRadius: 9,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon size={13} color={m.color} />
                        <span style={{ fontSize: 13, color: 'var(--text)' }}>{m.label}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: m.color, background: m.bg, padding: '2px 10px', borderRadius: 10 }}>{count}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <QuickActions actions={quickActions} onNavigate={navigate} />
    </div>
  )
}

function QuickActions({
  actions,
  onNavigate,
}: {
  actions: { label: string; Icon: React.FC<{ size?: number }>; color: string; bg: string; path: string }[]
  onNavigate: (path: string) => void
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: 'var(--shadow-sm)' }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Quick actions</h2>
      <div style={{ display: 'flex', gap: 10 }}>
        {actions.map(a => <QuickActionBtn key={a.label} {...a} onClick={() => onNavigate(a.path)} />)}
      </div>
    </div>
  )
}

function RoleTypeBreakdown({ breakdown }: { breakdown: RoleTypeBreakdown }) {
  const nonZero = Object.entries(breakdown).filter(([, v]) => v > 0)
  if (nonZero.length === 0) return null

  const badges: Record<string, { label: string; color: string; bg: string }> = {
    'new-headcount': { label: 'new hires',  color: 'var(--success)', bg: 'var(--success-bg)' },
    'backfill':      { label: 'backfills',  color: 'var(--warn)',    bg: 'var(--warn-bg)'    },
    'contractor':    { label: 'contractors',color: 'var(--purple)',  bg: 'var(--purple-bg)'  },
    'tbd':           { label: 'TBD',        color: 'var(--dim)',     bg: 'var(--raised)'     },
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>By role type</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {nonZero.map(([type, count]) => {
          const b = badges[type as keyof typeof badges]
          return (
            <span key={type} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 20,
              background: b.bg, color: b.color,
              fontSize: 11, fontWeight: 600,
            }}>
              {count} {b.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function QuickActionBtn({
  label, Icon, color, bg, onClick,
}: {
  label: string
  Icon: React.FC<{ size?: number }>
  color: string
  bg: string
  onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px',
        background: hov ? bg : 'var(--raised)',
        border: `1px solid ${hov ? color : 'var(--border)'}`,
        borderRadius: 10, cursor: 'pointer',
        color: hov ? color : 'var(--muted)',
        transition: 'all .15s',
      }}
    >
      <Icon size={16} />
      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
    </button>
  )
}
