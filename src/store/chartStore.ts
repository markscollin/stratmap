import { create } from 'zustand'
import type { OrgChart, OrgNode, OrgEdge, ChartStatus, Department } from '../types'
import { api } from '../lib/apiClient'

interface ChartStore {
  charts: OrgChart[]
  loading: boolean
  loaded: boolean

  fetchCharts: () => Promise<void>
  createChart: (name: string, nodes: OrgNode[], edges: OrgEdge[], departments: Department[]) => Promise<OrgChart | null>
  setActiveChart: (id: string | null) => void
  updateChartStatus: (id: string, status: ChartStatus) => void
  duplicateChart: (id: string) => Promise<void>

  // kept for backwards compat (canvas uses this to merge fetched data)
  addChart: (chart: OrgChart) => void
}

export const useChartStore = create<ChartStore>((set, get) => ({
  charts: [],
  loading: false,
  loaded: false,

  async fetchCharts() {
    if (get().loading) return
    set({ loading: true })
    try {
      const raw = await api.get<Record<string, unknown>[]>('/api/charts')
      const charts: OrgChart[] = raw.map(c => ({
        id: String(c.id),
        name: String(c.name),
        status: c.status as ChartStatus,
        version: Number(c.version ?? 1),
        departments: [],
        nodes: [],
        edges: [],
        owner: String(c.ownerId ?? ''),
        creator: String(c.creatorId ?? ''),
        collaborators: [],
        createdAt: String(c.createdAt),
        updatedAt: String(c.updatedAt),
      }))
      set({ charts, loaded: true })
    } catch (err) {
      console.error('[chartStore] fetchCharts failed:', err)
    } finally {
      set({ loading: false })
    }
  },

  async createChart(name, nodes, edges, departments) {
    try {
      const raw = await api.post<Record<string, unknown>>('/api/charts', {
        name,
        templateNodes: nodes,
        templateEdges: edges,
        templateDepts: departments,
      })
      const chart: OrgChart = {
        id: String(raw.id),
        name: String(raw.name),
        status: raw.status as ChartStatus,
        version: Number(raw.version ?? 1),
        departments,
        nodes,
        edges,
        owner: String(raw.ownerId ?? ''),
        creator: String(raw.creatorId ?? ''),
        collaborators: [],
        createdAt: String(raw.createdAt),
        updatedAt: String(raw.updatedAt),
      }
      set(s => ({ charts: [chart, ...s.charts] }))
      return chart
    } catch (err) {
      console.error('[chartStore] createChart failed:', err)
      return null
    }
  },

  setActiveChart: () => {},

  updateChartStatus(id, status) {
    set(s => ({
      charts: s.charts.map(c =>
        c.id === id ? { ...c, status, updatedAt: new Date().toISOString() } : c
      ),
    }))
    api.put(`/api/charts/${id}`, { status }).catch(err =>
      console.error('[chartStore] updateChartStatus failed:', err)
    )
  },

  async duplicateChart(id) {
    const source = get().charts.find(c => c.id === id)
    if (!source) return
    const chart = await get().createChart(
      `${source.name} (copy)`,
      source.nodes,
      source.edges,
      source.departments,
    )
    if (!chart) return
  },

  addChart(chart) {
    set(s => ({ charts: [chart, ...s.charts] }))
  },
}))
