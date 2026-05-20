import { create } from 'zustand'
import { api } from '../lib/apiClient'
import type { RoleType } from '../types'

export type HeadcountStatus = 'planned' | 'approved' | 'filled'

export interface HeadcountPlan {
  id: string
  workspaceId: string
  title: string
  departmentId: string | null
  departmentName: string | null
  departmentColour: string | null
  roleType: RoleType
  targetQuarter: string   // "2026-Q2"
  chartId: string | null
  status: HeadcountStatus
  notes: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface HeadcountStore {
  plans: HeadcountPlan[]
  loading: boolean
  fetch: () => Promise<void>
  create: (data: {
    title: string
    departmentId?: string
    roleType?: RoleType
    targetQuarter: string
    chartId?: string
    notes?: string
  }) => Promise<HeadcountPlan | null>
  update: (id: string, updates: Partial<Pick<HeadcountPlan, 'title' | 'departmentId' | 'roleType' | 'targetQuarter' | 'chartId' | 'status' | 'notes'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

function rawToPlan(raw: Record<string, unknown>): HeadcountPlan {
  return {
    id:                String(raw.id),
    workspaceId:       String(raw.workspaceId ?? ''),
    title:             String(raw.title ?? ''),
    departmentId:      raw.departmentId ? String(raw.departmentId) : null,
    departmentName:    raw.departmentName ? String(raw.departmentName) : null,
    departmentColour:  raw.departmentColour ? String(raw.departmentColour) : null,
    roleType:          (raw.roleType as RoleType) ?? 'new-headcount',
    targetQuarter:     String(raw.targetQuarter ?? ''),
    chartId:           raw.chartId ? String(raw.chartId) : null,
    status:            (raw.status as HeadcountStatus) ?? 'planned',
    notes:             raw.notes ? String(raw.notes) : null,
    createdBy:         String(raw.createdBy ?? ''),
    createdAt:         raw.createdAt ? String(raw.createdAt) : new Date().toISOString(),
    updatedAt:         raw.updatedAt ? String(raw.updatedAt) : new Date().toISOString(),
  }
}

export const useHeadcountStore = create<HeadcountStore>((set, get) => ({
  plans: [],
  loading: false,

  async fetch() {
    if (get().loading) return
    set({ loading: true })
    try {
      const raw = await api.get<Record<string, unknown>[]>('/api/headcount')
      set({ plans: raw.map(rawToPlan) })
    } catch (err) {
      console.error('[headcountStore] fetch failed:', err)
    } finally {
      set({ loading: false })
    }
  },

  async create(data) {
    try {
      const raw = await api.post<Record<string, unknown>>('/api/headcount', data)
      const plan = rawToPlan(raw)
      set(s => ({ plans: [...s.plans, plan] }))
      return plan
    } catch (err) {
      console.error('[headcountStore] create failed:', err)
      return null
    }
  },

  async update(id, updates) {
    // Optimistic update
    set(s => ({
      plans: s.plans.map(p => p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p),
    }))
    try {
      await api.put(`/api/headcount/${id}`, updates)
    } catch (err) {
      console.error('[headcountStore] update failed:', err)
      get().fetch()  // rollback via re-fetch
    }
  },

  async remove(id) {
    set(s => ({ plans: s.plans.filter(p => p.id !== id) }))
    try {
      await api.delete(`/api/headcount/${id}`)
    } catch (err) {
      console.error('[headcountStore] remove failed:', err)
      get().fetch()
    }
  },
}))
