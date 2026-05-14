import { useUserStore } from '../../store/userStore'
import type { User, Permission } from '../../types'

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''
export const IS_DEV_BYPASS = !CLERK_KEY || CLERK_KEY === 'pk_test_placeholder' || CLERK_KEY.endsWith('placeholder')

export interface AuthUser {
  id: string
  name: string
  email: string
  avatarUrl?: string
  initials: string
}

export interface UseAuthReturn {
  user: AuthUser | null
  permission: Permission
  isLoaded: boolean
  isSignedIn: boolean
  signOut: () => void
}

function toInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function toAuthUser(u: User): AuthUser {
  return { ...u, initials: toInitials(u.name) }
}

export function useAuth(): UseAuthReturn {
  const { user, permission, isAuthenticated } = useUserStore()

  return {
    user: user ? toAuthUser(user) : null,
    permission,
    isLoaded: true,
    isSignedIn: isAuthenticated,
    signOut: () => {}, // Handled by TopNav directly via Clerk/store
  }
}
