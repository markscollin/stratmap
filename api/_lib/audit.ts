import { db } from './db'
import { auditLog } from '../../src/lib/db/schema'

// Audit log (roadmap 4.4): who changed what, when, for member, permission, invite, share and salary
// changes. Call `logAudit` AFTER the change has been made.
//
// Owner-decided: salary events record THAT a band changed and on which role, never the amounts.
// `details` must stay small and must never hold salary values, tokens or other secrets.
//
// Best-effort: a failure to write the log is reported to the server log but never fails or undoes the
// action itself (an outage of this table must not stop people managing their workspace).

export type AuditAction =
  | 'member.joined'
  | 'member.role_changed'
  | 'member.removed'
  | 'invite.sent'
  | 'invite.resent'
  | 'invite.revoked'
  | 'share.link_created'
  | 'share.link_revoked'
  | 'share.public_on'
  | 'share.public_off'
  | 'salary.updated'

export type AuditTargetType = 'member' | 'invite' | 'chart' | 'role'
export type AuditDetails = Record<string, string | number | boolean | null>

export interface AuditEvent {
  workspaceId: string
  actorUserId: string
  action: AuditAction
  targetType: AuditTargetType
  targetId?: string | null
  details?: AuditDetails
}

export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      workspaceId: event.workspaceId,
      actorUserId: event.actorUserId,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId ?? null,
      details: event.details ?? {},
    })
  } catch (err) {
    console.error('[audit] could not write audit event', event.action, err)
  }
}
