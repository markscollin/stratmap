import type { LucideIcon } from 'lucide-react'
import { Edit3, AlertCircle, AlertTriangle, CheckCircle2, Eye, Archive } from 'lucide-react'
import type { ChartStatus, Permission } from '../types'

export interface StatusMeta {
  label: string
  color: string
  bg: string
  Icon: LucideIcon
}

export const STATUS_META: Record<ChartStatus, StatusMeta> = {
  draft:    { label: 'Draft',             color: 'var(--muted)',   bg: 'rgba(148,163,184,0.12)', Icon: Edit3 },
  editing:  { label: 'Editing',           color: 'var(--warn)',    bg: 'var(--warn-bg)',          Icon: Edit3 },
  review:   { label: 'In Review',         color: 'var(--purple)',  bg: 'var(--purple-bg)',         Icon: AlertCircle },
  rejected: { label: 'Changes Requested', color: 'var(--danger)',  bg: 'var(--danger-bg)',         Icon: AlertTriangle },
  approved: { label: 'Approved',          color: 'var(--brand)',   bg: 'var(--brand-bg)',          Icon: CheckCircle2 },
  live:     { label: 'Live',              color: 'var(--success)', bg: 'var(--success-bg)',        Icon: Eye },
  archived: { label: 'Retired',           color: 'var(--dim)',     bg: 'rgba(71,85,105,0.12)',     Icon: Archive },
}

export const STATUS_ACTIONS: Record<ChartStatus, { next: ChartStatus; label: string; color: string; minPermission: Permission }[]> = {
  draft:    [{ next: 'review',   label: 'Submit for approval', color: 'var(--purple)', minPermission: 'editor' }],
  editing:  [{ next: 'review',   label: 'Submit for approval', color: 'var(--purple)', minPermission: 'editor' }],
  review:   [{ next: 'approved', label: 'Approve',             color: 'var(--brand)',  minPermission: 'admin'  },
             { next: 'rejected', label: 'Request changes',     color: 'var(--danger)', minPermission: 'admin'  }],
  rejected: [{ next: 'editing',  label: 'Revise',              color: 'var(--warn)',   minPermission: 'editor' }],
  approved: [{ next: 'live',     label: 'Publish',             color: 'var(--success)',minPermission: 'admin'  }],
  live:     [{ next: 'editing',  label: 'Start revision',      color: 'var(--warn)',   minPermission: 'admin'  },
             { next: 'archived', label: 'Retire',              color: 'var(--dim)',    minPermission: 'admin'  }],
  archived: [],
}
