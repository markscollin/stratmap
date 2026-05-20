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

  async fetch() {
    if (get().loading) return
    set({ loading: true })
    try {
      const raw = await api.get<Record<string, unknown>[]>('/api/workspace/departments')
      set({ departments: raw.map(rawToDept) })
    } catch (err) {
      console.error('[workspaceDepartmentStore] fetch failed:', err)
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
