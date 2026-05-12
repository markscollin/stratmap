import { useUserStore } from '../store/userStore'
import type { Permission } from '../types'

const RANK: Record<Permission, number> = {
  owner:     5,
  admin:     4,
  editor:    3,
  commenter: 2,
  viewer:    1,
}

function atLeast(current: Permission, required: Permission): boolean {
  return RANK[current] >= RANK[required]
}

export interface UsePermissionReturn {
  permission: Permission
  isOwner: boolean
  canAdmin: boolean
  canEdit: boolean
  canComment: boolean
}

export function usePermission(): UsePermissionReturn {
  const { permission } = useUserStore()
  return {
    permission,
    isOwner:    permission === 'owner',
    canAdmin:   atLeast(permission, 'admin'),
    canEdit:    atLeast(permission, 'editor'),
    canComment: atLeast(permission, 'commenter'),
  }
}
