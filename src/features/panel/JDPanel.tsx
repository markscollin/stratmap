import { useEffect, useState } from 'react'
import { X, Briefcase, MapPin, Clock } from 'lucide-react'
import type { OrgNode } from '../../types'
import type { RoleStatus } from '../../types/chart'
import type { JobDescription } from '../../types/jd'
import { mockDepartments } from '../../data/mockOrg'
import { usePermission } from '../../hooks/usePermission'
import { useJobDescriptionStore } from '../../store/jobDescriptionStore'
import { JDEditor } from '../jd/JDEditor'

type PanelTab = 'overview' | 'responsibilities' | 'requirements'

const STATUS_COLOUR: Record<RoleStatus, string> = {
  draft:       'var(--muted)',
  'in-review': 'var(--purple)',
  approved:    'var(--brand)',
  published:   'var(--success)',
  hired:       'var(--success)',
}

const STATUS_LABEL: Record<RoleStatus, string> = {
  draft:       'Draft',
  'in-review': 'In Review',
  approved:    'Approved',
  published:   'Published',
  hired:       'Hired',
}

export function JDPanel({ node, allNodes = [], onClose, onEditNode }: {
  node: OrgNode | null
  allNodes?: OrgNode[]
  onClose: () => void
  onEditNode?: (node: OrgNode) => void
}) {
  const [tab, setTab] = useState<PanelTab>('overview')
  const dept = node ? mockDepartments.find(d => d.id === node.departmentId) : null
  const { canEdit, canAdmin } = usePermission()

  const initJD    = useJobDescriptionStore(s => s.initJD)
  const updateJD  = useJobDescriptionStore(s => s.updateJD)
  const setStatus = useJobDescriptionStore(s => s.setStatus)
  const jd        = useJobDescriptionStore(s => node ? s.jobDescriptions[node.id] : undefined)

  useEffect(() => {
    if (node) initJD(node.id)
  }, [node?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const isVisible = !!node

  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
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
                  {jd && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: STATUS_COLOUR[jd.status],
                      background: `${STATUS_COLOUR[jd.status]}20`,
                      padding: '2px 8px', borderRadius: 20,
                      textTransform: 'uppercase', letterSpacing: '.5px',
                    }}>
                      {STATUS_LABEL[jd.status]}
                    </span>
                  )}
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
              {(['overview', 'responsibilities', 'requirements'] as PanelTab[]).map(t => (
                <button key={t} onClick={(e) => { e.stopPropagation(); setTab(t) }} style={{
                  padding: '8px 14px', background: 'transparent', border: 'none',
                  borderBottom: `2px solid ${tab === t ? 'var(--brand)' : 'transparent'}`,
                  color: tab === t ? 'var(--brand)' : 'var(--muted)',
                  fontSize: 12, fontWeight: tab === t ? 600 : 400,
                  cursor: 'pointer', marginBottom: -1, transition: 'all .15s',
                }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
            {tab === 'overview' && <OverviewTab node={node} dept={dept} allNodes={allNodes} />}
            {tab === 'responsibilities' && jd && (
              <JDContentTab
                key={`${node.id}-resp`}
                content={jd.responsibilities}
                onSave={html => updateJD(node.id, { responsibilities: html })}
                editable={canEdit}
                placeholder="Outline the key responsibilities of this role…"
                jd={jd}
              />
            )}
            {tab === 'requirements' && jd && (
              <JDContentTab
                key={`${node.id}-req`}
                content={jd.requirements}
                onSave={html => updateJD(node.id, { requirements: html })}
                editable={canEdit}
                placeholder="List the qualifications and experience required…"
                jd={jd}
              />
            )}
            {(tab === 'responsibilities' || tab === 'requirements') && !jd && (
              <div style={{ textAlign: 'center', paddingTop: 40, color: 'var(--dim)', fontSize: 13 }}>
                Loading…
              </div>
            )}
          </div>

          {/* Footer */}
          {(canEdit || canAdmin) && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
              {canEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEditNode?.(node) }}
                  style={{ flex: 1, padding: '8px', background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}
                >
                  Edit role
                </button>
              )}
              {jd && (
                <StatusAction
                  status={jd.status}
                  canEdit={canEdit}
                  canAdmin={canAdmin}
                  onStatusChange={s => setStatus(node.id, s)}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function JDContentTab({ content, onSave, editable, placeholder, jd }: {
  content: string
  onSave: (html: string) => void
  editable: boolean
  placeholder: string
  jd: JobDescription
}) {
  const colour = STATUS_COLOUR[jd.status]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: colour,
          background: `${colour}20`,
          padding: '2px 8px', borderRadius: 20,
          textTransform: 'uppercase', letterSpacing: '.5px',
        }}>
          {STATUS_LABEL[jd.status]}
        </span>
        <span style={{ fontSize: 10, color: 'var(--dim)' }}>v{jd.version}</span>
        {jd.updatedAt && (
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>
            · {new Date(jd.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <JDEditor
        content={content}
        onSave={onSave}
        editable={editable}
        placeholder={placeholder}
      />
    </div>
  )
}

function StatusAction({ status, canEdit, canAdmin, onStatusChange }: {
  status: RoleStatus
  canEdit: boolean
  canAdmin: boolean
  onStatusChange: (s: RoleStatus) => void
}) {
  if (status === 'draft' && canEdit) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onStatusChange('in-review') }}
        style={{ flex: 1, padding: '8px', background: 'var(--grad-purple)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >
        Submit for review
      </button>
    )
  }
  if (status === 'in-review') {
    if (canAdmin) {
      return (
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange('draft') }}
            style={{ flex: 1, padding: '8px', background: 'var(--raised)', border: '1px solid var(--danger)', borderRadius: 8, color: 'var(--danger)', fontSize: 12, cursor: 'pointer' }}
          >
            Changes
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange('approved') }}
            style={{ flex: 1, padding: '8px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Approve
          </button>
        </div>
      )
    }
    return (
      <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'var(--dim)', padding: '8px' }}>
        Awaiting review
      </span>
    )
  }
  if (status === 'approved' && canAdmin) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onStatusChange('published') }}
        style={{ flex: 1, padding: '8px', background: 'var(--grad-success)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >
        Publish
      </button>
    )
  }
  if (status === 'published') {
    if (canAdmin) {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); onStatusChange('hired') }}
          style={{ flex: 1, padding: '8px', background: 'var(--grad-success)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Mark as hired
        </button>
      )
    }
    if (canEdit) {
      return (
        <button
          onClick={() => onStatusChange('draft')}
          style={{ flex: 1, padding: '8px', background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}
        >
          New revision
        </button>
      )
    }
  }
  if (status === 'hired' && canAdmin) {
    return (
      <button
        onClick={() => onStatusChange('draft')}
        style={{ flex: 1, padding: '8px', background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}
      >
        Reopen role
      </button>
    )
  }
  return null
}

function OverviewTab({ node, dept, allNodes }: {
  node: OrgNode
  dept: ReturnType<typeof mockDepartments.find> | null
  allNodes: OrgNode[]
}) {
  const manager = node.managerId ? allNodes.find(n => n.id === node.managerId) : null
  const fields = [
    { label: 'Employment type', value: node.employmentType },
    { label: 'Status',          value: node.status },
    { label: 'Department',      value: dept?.name ?? node.departmentId },
    { label: 'Reports to',      value: manager ? `${manager.name} · ${manager.title}` : 'No manager (root)' },
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
      <div style={{ marginTop: 20, padding: '14px', background: 'var(--raised)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Salary band</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Admin access required to view compensation data.</div>
      </div>
    </div>
  )
}
