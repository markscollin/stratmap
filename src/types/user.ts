export type Permission = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'

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
