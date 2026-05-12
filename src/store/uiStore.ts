import { create } from 'zustand'

interface UIStore {
  isDark: boolean
  sidebarCollapsed: boolean
  activePanelNodeId: string | null
  spotlightOpen: boolean
  toggleTheme: () => void
  toggleSidebar: () => void
  openPanel: (nodeId: string) => void
  closePanel: () => void
  setSpotlightOpen: (open: boolean) => void
}

export const useUIStore = create<UIStore>((set, get) => ({
  isDark: true,
  sidebarCollapsed: false,
  activePanelNodeId: null,
  spotlightOpen: false,

  toggleTheme: () => {
    const next = !get().isDark
    if (next) {
      document.documentElement.removeAttribute('data-theme')   // dark = :root default
    } else {
      document.documentElement.setAttribute('data-theme', 'light')
    }
    set({ isDark: next })
  },

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  openPanel: (nodeId) => set({ activePanelNodeId: nodeId }),

  closePanel: () => set({ activePanelNodeId: null }),

  setSpotlightOpen: (open) => set({ spotlightOpen: open }),
}))
