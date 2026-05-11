import { create } from 'zustand'
import type { OrgChart, ChartStatus } from '../types'
import { mockCharts } from '../data/mockOrg'

interface ChartStore {
  charts: OrgChart[]
  activeChartId: string | null
  setActiveChart: (id: string | null) => void
  updateChartStatus: (id: string, status: ChartStatus) => void
  addChart: (chart: OrgChart) => void
  duplicateChart: (id: string) => void
}

export const useChartStore = create<ChartStore>((set, get) => ({
  charts: mockCharts,
  activeChartId: null,

  setActiveChart: (id) => set({ activeChartId: id }),

  updateChartStatus: (id, status) =>
    set((state) => ({
      charts: state.charts.map((c) =>
        c.id === id
          ? { ...c, status, updatedAt: new Date().toISOString() }
          : c
      ),
    })),

  addChart: (chart) =>
    set((state) => ({ charts: [chart, ...state.charts] })),

  duplicateChart: (id) => {
    const source = get().charts.find((c) => c.id === id)
    if (!source) return
    const copy: OrgChart = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} (copy)`,
      status: 'draft',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    set((state) => ({ charts: [copy, ...state.charts] }))
  },
}))
