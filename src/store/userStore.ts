import { create } from 'zustand'
import type { User, Permission, Workspace, PendingInvite } from '../types'

interface UserStore {
  user: User | null
  permission: Permission
  isAuthenticated: boolean
  workspace: Workspace | null

  setUser: (user: User | null, permission?: Permission) => void
  setPermission: (permission: Permission) => void
  setWorkspace: (workspace: Workspace) => void
  signOut: () => void
  addPendingInvite: (invite: PendingInvite) => void
  removePendingInvite: (email: string) => void
  updateMemberPermission: (userId: string, permission: Permission) => void
  removeMember: (userId: string) => void
}

// Load workspace from localStorage if available
function loadWorkspaceFromStorage(): Workspace | null {
  try {
    const stored = localStorage.getItem('stratmap_workspace')
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

export const useUserStore = create<UserStore>((set) => ({
  user: null,
  permission: 'viewer',
  isAuthenticated: false,
  workspace: loadWorkspaceFromStorage(),

  setUser: (user, permission = 'editor') =>
    set({ user, isAuthenticated: !!user, permission: user ? permission : 'viewer' }),

  setPermission: (permission) => set({ permission }),

  setWorkspace: (workspace) => {
    // Persist to localStorage
    if (workspace) {
      try {
        localStorage.setItem('stratmap_workspace', JSON.stringify(workspace))
      } catch {
        // localStorage full or unavailable, continue anyway
      }
    }
    set({ workspace })
  },

  signOut: () => set({ user: null, isAuthenticated: false, permission: 'viewer', workspace: null }),

  addPendingInvite: (invite) =>
    set((state) => {
      if (!state.workspace) return state
      const already = state.workspace.pendingInvites.some(i => i.email === invite.email)
      if (already) return state
      return {
        workspace: {
          ...state.workspace,
          pendingInvites: [...state.workspace.pendingInvites, invite],
        },
      }
    }),

  removePendingInvite: (email) =>
    set((state) => {
      if (!state.workspace) return state
      return {
        workspace: {
          ...state.workspace,
          pendingInvites: state.workspace.pendingInvites.filter(i => i.email !== email),
        },
      }
    }),

  updateMemberPermission: (userId, permission) =>
    set((state) => {
      if (!state.workspace) return state
      return {
        workspace: {
          ...state.workspace,
          members: state.workspace.members.map((m) =>
            m.user.id === userId ? { ...m, permission } : m
          ),
        },
      }
    }),

  removeMember: (userId) =>
    set((state) => {
      if (!state.workspace) return state
      return {
        workspace: {
          ...state.workspace,
          members: state.workspace.members.filter((m) => m.user.id !== userId),
        },
      }
    }),
}))

export const MOCK_WORKSPACE: Workspace = {
  id: 'ws-dev',
  name: 'Acme Corp',
  ownerRole: 'Founder/CEO',
  size: '11-50',
  members: [
    {
      user: { id: 'u-1', name: 'Dev User', email: 'dev@example.com' },
      permission: 'owner',
      joinedAt: '2026-01-01T00:00:00Z',
    },
  ],
  pendingInvites: [],
  createdAt: '2026-01-01T00:00:00Z',
}

export const MOCK_USER: User = {
  id: 'u-1',
  name: 'Dev User',
  email: 'dev@example.com',
}
