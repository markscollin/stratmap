import { create } from 'zustand'
import { api } from '../lib/apiClient'

export interface WorkspaceDepartment {
  id: string
  workspaceId: string
  name: string
  colour: string
}

interface WorkspaceDepartmentStore {
  departments: WorkspaceDepartment[]
  loading: boolean
  /** The first load succeeded at least once. A failed refresh keeps what was loaded (R-46). */
  loaded: boolean
  /** The last load failed (R-46). Pickers say so and offer Retry, so "no departments" is never guessed. */
  error: boolean
  fetch: () => Promise<void>
  create: (name: string, colour: string) => Promise<WorkspaceDepartment | null>
  update: (id: string, updates: { name?: string; colour?: string }) => Promise<void>
  remove: (id: string) => Promise<void>
}

function rawToDept(raw: Record<string, unknown>): WorkspaceDepartment {
  return {
    id:          String(raw.id),
    workspaceId: String(raw.workspaceId ?? ''),
    name:        String(raw.name ?? ''),
    colour:      String(raw.colour ?? '#94A3B8'),
  }
}

export const useWorkspaceDepartmentStore = create<WorkspaceDepartmentStore>((set, get) => ({
  departments: [],
  loading: false,
  loaded: false,
  error: false,

  async fetch() {
    if (get().loading) return
    set({ loading: true, error: false })
    try {
      const raw = await api.get<Record<string, unknown>[]>('/api/workspace/departments')
      set({ departments: raw.map(rawToDept), loaded: true, error: false })
    } catch (err) {
      console.error('[workspaceDepartmentStore] fetch failed:', err)
      set({ error: true })
    } finally {
      set({ loading: false })
    }
  },

  async create(name, colour) {
    try {
      const raw = await api.post<Record<string, unknown>>('/api/workspace/departments', { name, colour })
      const dept = rawToDept(raw)
      set(s => ({ departments: [...s.departments, dept] }))
      return dept
    } catch (err) {
      console.error('[workspaceDepartmentStore] create failed:', err)
      return null
    }
  },

  async update(id, updates) {
    try {
      await api.put(`/api/workspace/departments/${id}`, updates)
      set(s => ({
        departments: s.departments.map(d => d.id === id ? { ...d, ...updates } : d),
      }))
    } catch (err) {
      console.error('[workspaceDepartmentStore] update failed:', err)
    }
  },

  async remove(id) {
    set(s => ({ departments: s.departments.filter(d => d.id !== id) }))
    try {
      await api.delete(`/api/workspace/departments/${id}`)
    } catch (err) {
      console.error('[workspaceDepartmentStore] remove failed:', err)
    }
  },
}))

/**
 * True while the department list could not be loaded and nothing was loaded before (R-46). A picker then says so with a Retry
 * instead of showing an empty list, which would invite people to re-create departments that already exist.
 */
export function useDepartmentsLoad() {
  const failed = useWorkspaceDepartmentStore(s => s.error && !s.loaded)
  const loading = useWorkspaceDepartmentStore(s => s.loading)
  return { failed, loading, retry: () => { void useWorkspaceDepartmentStore.getState().fetch() } }
}
