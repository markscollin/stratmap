export type Permission = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'

export type CompanySize = '1-10' | '11-50' | '51-200' | '201-1000' | '1000+'
export type WorkspaceRole = 'Founder/CEO' | 'HR Leader' | 'Operations' | 'Finance' | 'Other'

export type PlanTier = 'free' | 'starter' | 'growth' | 'enterprise'

export interface Plan {
  tier: PlanTier
  seats: number
  maxCharts: number
  maxNodesPerChart: number
  billingCycle: 'monthly' | 'annual' | null
  renewsAt: string | null
}

/** The workspace's Stripe subscription as /api/workspace reports it (roadmap 1.3). */
export interface SubscriptionInfo {
  /** Stripe's status (active, past_due, unpaid, canceled, …), or null if the workspace never subscribed. */
  status: string | null
  /** End of the paid-through period, or when a scheduled cancellation takes effect. ISO date. */
  planExpiresAt: string | null
  cancelAtPeriodEnd: boolean
  /** True once the workspace has a Stripe customer, so the Customer Portal can open. */
  hasBillingAccount: boolean
}

export interface UsageLimits {
  chartsUsed: number
  seatsUsed: number
  aiDraftsUsed: number
  aiDraftsLimit: number
}

export interface User {
  id: string
  name: string
  email: string
  avatarUrl?: string
}

export interface WorkspaceMember {
  user: User
  permission: Permission
  joinedAt: string
}

export interface PendingInvite {
  email: string
  permission: Permission
  sentAt: string
}

export interface Workspace {
  id: string
  name: string
  ownerRole: WorkspaceRole
  size: CompanySize
  members: WorkspaceMember[]
  pendingInvites: PendingInvite[]
  createdAt: string
}
