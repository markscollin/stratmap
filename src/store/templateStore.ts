import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mockRoleTemplates } from '../data/mockJDs'

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
  addTemplate: (t: Omit<Template, 'id' | 'createdBy' | 'updatedAt'>) => string
  updateTemplate: (id: string, updates: Partial<Omit<Template, 'id'>>) => void
  deleteTemplate: (id: string) => void
  duplicateTemplate: (id: string) => string
}

function seedTemplates(): Record<string, Template> {
  const map: Record<string, Template> = {}
  mockRoleTemplates.forEach(t => {
    map[t.id] = {
      id: t.id,
      title: t.title,
      department: t.dept,
      responsibilities: '',
      requirements: '',
      tags: t.tags,
      createdBy: t.updatedBy,
      updatedBy: t.updatedBy,
      updatedAt: new Date().toISOString(),
      uses: t.uses,
    }
  })
  return map
}

export const useTemplateStore = create<TemplateStore>()(
  persist(
    (set, get) => ({
      templates: seedTemplates(),

      addTemplate(t) {
        const id = `tmpl-${Date.now()}`
        set(s => ({
          templates: {
            ...s.templates,
            [id]: { ...t, id, createdBy: 'You', updatedAt: new Date().toISOString() },
          },
        }))
        return id
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
      },

      deleteTemplate(id) {
        set(s => {
          const next = { ...s.templates }
          delete next[id]
          return { templates: next }
        })
      },

      duplicateTemplate(id) {
        const src = get().templates[id]
        if (!src) return ''
        const newId = `tmpl-${Date.now()}`
        set(s => ({
          templates: {
            ...s.templates,
            [newId]: { ...src, id: newId, title: `${src.title} (copy)`, uses: 0, updatedAt: new Date().toISOString() },
          },
        }))
        return newId
      },
    }),
    { name: 'stratmap-templates' }
  )
)
