import { create } from 'zustand'

interface UIStore {
  isDark: boolean
  sidebarCollapsed: boolean
  activePanelNodeId: string | null
  spotlightOpen: boolean
  /** Phones only: the slide-in navigation drawer (roadmap 2.8). */
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  toggleTheme: () => void
  toggleSidebar: () => void
  openPanel: (nodeId: string) => void
  closePanel: () => void
  setSpotlightOpen: (open: boolean) => void
}

const THEME_KEY = 'stratmap_theme'

/** The theme this browser last chose; dark is the default. Storage can be unavailable (private window), so every access is guarded. */
function loadIsDark(): boolean {
  try { return localStorage.getItem(THEME_KEY) !== 'light' } catch { return true }
}

function applyTheme(isDark: boolean) {
  if (typeof document === 'undefined') return
  if (isDark) document.documentElement.removeAttribute('data-theme')   // dark = :root default
  else document.documentElement.setAttribute('data-theme', 'light')
}

const initialIsDark = loadIsDark()
applyTheme(initialIsDark) // before the first paint of anything that reads the store, so a saved light theme does not flash dark

export const useUIStore = create<UIStore>((set, get) => ({
  isDark: initialIsDark,
  sidebarCollapsed: false,
  activePanelNodeId: null,
  spotlightOpen: false,
  mobileNavOpen: false,

  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),

  toggleTheme: () => {
    const next = !get().isDark
    applyTheme(next)
    try { localStorage.setItem(THEME_KEY, next ? 'dark' : 'light') } catch { /* the choice just will not be remembered */ }
    set({ isDark: next })
  },

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  openPanel: (nodeId) => set({ activePanelNodeId: nodeId }),

  closePanel: () => set({ activePanelNodeId: null }),

  setSpotlightOpen: (open) => set({ spotlightOpen: open }),
}))
