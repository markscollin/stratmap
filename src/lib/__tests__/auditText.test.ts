import { describe, it, expect } from 'vitest'
import { describeAudit, type AuditEventView } from '../auditText'

const base = { id: 'e1', targetType: 'member', targetId: null, createdAt: '2026-11-06T10:00:00Z' }
const ev = (action: string, details: AuditEventView['details'], actor: Partial<AuditEventView['actor']> = {}): AuditEventView => ({
  ...base, action, details, actor: { userId: 'u1', name: 'Ada', email: 'ada@co.com', ...actor },
})

describe('describeAudit', () => {
  it('describes each action in a sentence', () => {
    expect(describeAudit(ev('member.role_changed', { email: 'bo@co.com', from: 'editor', to: 'viewer' }))).toBe('Ada changed bo@co.com from Editor to Viewer')
    expect(describeAudit(ev('member.removed', { email: 'bo@co.com', role: 'editor' }))).toBe('Ada removed bo@co.com (Editor)')
    expect(describeAudit(ev('member.joined', { email: 'bo@co.com', role: 'viewer' }))).toBe('Ada joined as Viewer')
    expect(describeAudit(ev('invite.sent', { email: 'bo@co.com', role: 'admin' }))).toBe('Ada invited bo@co.com as Admin')
    expect(describeAudit(ev('invite.revoked', { email: 'bo@co.com', role: 'admin' }))).toBe('Ada cancelled the invite to bo@co.com')
    expect(describeAudit(ev('share.public_on', { chartName: 'Q3 plan' }))).toBe('Ada made "Q3 plan" public')
    expect(describeAudit(ev('share.public_off', { chartName: 'Q3 plan' }))).toBe('Ada made "Q3 plan" private')
    expect(describeAudit(ev('share.link_created', { chartName: 'Q3 plan' }))).toBe('Ada created a share link for "Q3 plan"')
    expect(describeAudit(ev('share.link_revoked', { chartName: 'Q3 plan' }))).toBe('Ada turned off the share link for "Q3 plan"')
  })

  it('describes workspace lifecycle events', () => {
    expect(describeAudit(ev('member.left', { role: 'editor' }))).toBe('Ada left the workspace')
    expect(describeAudit(ev('workspace.deleted', {}))).toBe('Ada deleted the workspace')
    expect(describeAudit(ev('workspace.restored', {}))).toBe('Ada restored the workspace')
    expect(describeAudit(ev('workspace.exported', { format: 'csv' }))).toBe('Ada exported the workspace data')
  })

  it('names the salary parts that changed, never a number', () => {
    const text = describeAudit(ev('salary.updated', { roleTitle: 'CTO', changed: 'salaryBandMin,salaryBandMax' }))
    expect(text).toBe('Ada changed the salary band (minimum, maximum) for CTO')
    expect(text).not.toMatch(/\d/)
  })

  it('falls back to the email, then to "A former member", for the actor', () => {
    expect(describeAudit(ev('invite.resent', { email: 'x@co.com' }, { name: null }))).toBe('ada@co.com resent the invite to x@co.com')
    expect(describeAudit(ev('invite.resent', { email: 'x@co.com' }, { name: null, email: null }))).toBe('A former member resent the invite to x@co.com')
  })

  it('does not break on an action it does not know yet', () => {
    expect(describeAudit(ev('thing.happened', {}))).toBe('Ada: thing.happened')
  })
})
