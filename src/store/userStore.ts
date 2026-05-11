import { create } from 'zustand'
import type { User, Permission } from '../types'

interface UserStore {
  user: User | null
  permission: Permission
  isAuthenticated: boolean
}

export const useUserStore = create<UserStore>(() => ({
  user: null,
  permission: 'viewer',
  isAuthenticated: false,
}))
