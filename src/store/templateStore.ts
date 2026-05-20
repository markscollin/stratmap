import { create } from 'zustand'
import { api } from '../lib/apiClient'

export interface Template {
  id: string
  title: string
  department: string
  responsibilities: string
  requirements: string
  tags: string[]
  createdBy: string
  updatedBy: string
  updatedAt: string
  uses: number
}

interface TemplateStore {
  templates: Record<string, Template>
  loading: boolean
  fetchTemplates: () => Promise<void>
  addTemplate: (t: Omit<Template, 'id' | 'createdBy' | 'updatedAt'>) => Promise<void>
  updateTemplate: (id: string, updates: Partial<Omit<Template, 'id'>>) => void
  deleteTemplate: (id: string) => void
  duplicateTemplate: (id: string) => void
}

function rawToTemplate(raw: Record<string, unknown>): Template {
  return {
    id:               String(raw.id),
    title:            String(raw.title ?? ''),
    department:       String(raw.department ?? ''),
    responsibilities: String(raw.responsibilities ?? ''),
    requirements:     String(raw.requirements ?? ''),
    tags:             Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    createdBy:        String(raw.createdBy ?? ''),
    updatedBy:        String(raw.updatedBy ?? ''),
    updatedAt:        raw.updatedAt ? String(raw.updatedAt) : new Date().toISOString(),
    uses:             Number(raw.uses ?? 0),
  }
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  templates: {},
  loading: false,

  async fetchTemplates() {
    if (get().loading) return
    set({ loading: true })
    try {
      const raw = await api.get<Record<string, unknown>[]>('/api/templates')
      const map: Record<string, Template> = {}
      raw.forEach(r => { map[String(r.id)] = rawToTemplate(r) })
      set({ templates: map })
    } catch (err) {
      console.error('[templateStore] fetchTemplates failed:', err)
    } finally {
      set({ loading: false })
    }
  },

  async addTemplate(t) {
    try {
      const raw = await api.post<Record<string, unknown>>('/api/templates', t)
      const template = rawToTemplate(raw)
      set(s => ({ templates: { ...s.templates, [template.id]: template } }))
    } catch (err) {
      console.error('[templateStore] addTemplate failed:', err)
    }
  },

  updateTemplate(id, updates) {
    const existing = get().templates[id]
    if (!existing) return
    set(s => ({
      templates: {
        ...s.templates,
        [id]: { ...existing, ...updates, updatedBy: 'You', updatedAt: new Date().toISOString() },
      },
    }))
    api.put(`/api/templates/${id}`, updates).catch(err =>
      console.error('[templateStore] updateTemplate failed:', err)
    )
  },

  deleteTemplate(id) {
    set(s => {
      const next = { ...s.templates }
      delete next[id]
      return { templates: next }
    })
    api.delete(`/api/templates/${id}`).catch(err =>
      console.error('[templateStore] deleteTemplate failed:', err)
    )
  },

  duplicateTemplate(id) {
    const src = get().templates[id]
    if (!src) return
    get().addTemplate({
      ...src,
      title: `${src.title} (copy)`,
      uses: 0,
      updatedBy: 'You',
    })
  },
}))
