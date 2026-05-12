export type Permission = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'

export type CompanySize = '1-10' | '11-50' | '51-200' | '201-1000' | '1000+'
export type WorkspaceRole = 'Founder/CEO' | 'HR Leader' | 'Operations' | 'Finance' | 'Other'

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
