import { useState } from 'react'
import { X, Briefcase, MapPin, Clock } from 'lucide-react'
import type { OrgNode } from '../../types'
import { mockDepartments } from '../../data/mockOrg'
import { StatusBadge } from '../../components/ui/StatusBadge'
import type { ChartStatus } from '../../types'

type PanelTab = 'overview' | 'responsibilities' | 'requirements'

export function JDPanel({ node, onClose }: {
  node: OrgNode | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<PanelTab>('overview')
  const dept = node ? mockDepartments.find(d => d.id === node.departmentId) : null

  const isVisible = !!node

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: 320,
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
      zIndex: 30,
      boxShadow: isVisible ? 'var(--shadow)' : 'none',
    }}>
      {node && (
        <>
          {/* Header */}
          <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4, marginBottom: 6 }}>{node.title}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* Map chart status → role status roughly */}
                  <StatusBadge status={node.status === 'active' ? 'live' : node.status === 'open' ? 'review' : 'draft' as ChartStatus} />
                  {dept && (
                    <span style={{ fontSize: 11, color: dept.colour, background: `${dept.colour}18`, padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
                      {dept.name}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                <X size={16} />
              </button>
            </div>

            {/* Person info */}
            {node.status === 'active' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--raised)', borderRadius: 10, marginBottom: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: dept?.colour ?? 'var(--brand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {node.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{node.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{node.employmentType}</div>
                </div>
              </div>
            )}

            {/* Meta */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
              {[
                { Icon: Briefcase, label: node.title },
                { Icon: MapPin,    label: node.location ?? 'Remote / Hybrid' },
                { Icon: Clock,     label: node.startDate ? `Started ${node.startDate}` : node.status === 'planned' ? 'Hiring soon' : 'Active' },
              ].map(({ Icon, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                  <Icon size={12} color="var(--dim)" /> {label}
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginLeft: -20, paddingLeft: 20, marginRight: -20 }}>
              {(['overview', 'responsibilities', 'requirements'] as PanelTab[]).map(t => {
                const label = t.charAt(0).toUpperCase() + t.slice(1)
                return (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: '8px 14px', background: 'transparent', border: 'none',
                    borderBottom: `2px solid ${tab === t ? 'var(--brand)' : 'transparent'}`,
                    color: tab === t ? 'var(--brand)' : 'var(--muted)',
                    fontSize: 12, fontWeight: tab === t ? 600 : 400,
                    cursor: 'pointer', marginBottom: -1, transition: 'all .15s',
                  }}>{label}</button>
                )
              })}
            </div>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
            {tab === 'overview' && <OverviewTab node={node} />}
            {tab === 'responsibilities' && <PlaceholderTab label="Responsibilities" />}
            {tab === 'requirements'     && <PlaceholderTab label="Requirements" />}
          </div>

          {/* Footer actions */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <button style={{ flex: 1, padding: '8px', background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
              Edit role
            </button>
            <button style={{ flex: 1, padding: '8px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Approve
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function OverviewTab({ node }: { node: OrgNode }) {
  const fields = [
    { label: 'Employment type', value: node.employmentType },
    { label: 'Status',          value: node.status },
    { label: 'Department',      value: node.departmentId },
    { label: 'Reports to',      value: node.managerId ?? 'No manager (root)' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {fields.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
            <span style={{ fontSize: 13, color: 'var(--text)', textTransform: 'capitalize' }}>{value}</span>
          </div>
        ))}
      </div>
      {/* Salary band placeholder */}
      <div style={{ marginTop: 20, padding: '14px', background: 'var(--raised)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Salary band</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Admin access required to view compensation data.</div>
      </div>
    </div>
  )
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', paddingTop: 40 }}>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text)' }}>{label}</strong> will be added via the JD editor in Sprint 6.
      </div>
    </div>
  )
}
