// Plain-English lines for the audit log (roadmap 4.4). The API sends codes (`member.role_changed`) and
// small details; this turns them into sentences. Pure, so it is easy to test.

export interface AuditEventView {
  id: string
  action: string
  targetType: string
  targetId: string | null
  details: Record<string, string | number | boolean | null>
  actor: { userId: string; name: string | null; email: string | null }
  createdAt: string
}

const cap = (s: unknown) => (typeof s === 'string' && s ? s.charAt(0).toUpperCase() + s.slice(1) : 'someone')
const str = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback)

const SALARY_PARTS: Record<string, string> = { salaryBandMin: 'minimum', salaryBandMax: 'maximum', salaryCurrency: 'currency' }

export function actorLabel(e: AuditEventView): string {
  return e.actor.name || e.actor.email || 'A former member'
}

export function describeAudit(e: AuditEventView): string {
  const who = actorLabel(e)
  const d = e.details
  const email = str(d.email, 'a member')
  const chart = `"${str(d.chartName, 'a chart')}"`
  switch (e.action) {
    case 'member.joined': return `${who} joined as ${cap(d.role)}`
    case 'member.role_changed': return `${who} changed ${email} from ${cap(d.from)} to ${cap(d.to)}`
    case 'member.removed': return `${who} removed ${email} (${cap(d.role)})`
    case 'invite.sent': return `${who} invited ${email} as ${cap(d.role)}`
    case 'invite.resent': return `${who} resent the invite to ${email}`
    case 'invite.revoked': return `${who} cancelled the invite to ${email}`
    case 'share.link_created': return `${who} created a share link for ${chart}`
    case 'share.link_revoked': return `${who} turned off the share link for ${chart}`
    case 'share.public_on': return `${who} made ${chart} public`
    case 'share.public_off': return `${who} made ${chart} private`
    case 'salary.updated': {
      const parts = str(d.changed, '').split(',').map(p => SALARY_PARTS[p]).filter(Boolean)
      return `${who} changed the salary band (${parts.join(', ') || 'details'}) for ${str(d.roleTitle, 'a role')}`
    }
    default: return `${who}: ${e.action}`
  }
}
