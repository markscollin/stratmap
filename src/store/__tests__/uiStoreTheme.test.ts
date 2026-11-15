import { describe, it, expect, beforeEach, vi } from 'vitest'

// R-34: the theme choice survives a reload. The store reads storage when it is first loaded, so each case loads it fresh.
async function freshStore() {
  vi.resetModules()
  return (await import('../uiStore')).useUIStore
}

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme') })

describe('theme', () => {
  it('is dark by default', async () => {
    const store = await freshStore()
    expect(store.getState().isDark).toBe(true)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('a choice of light is saved and applied on the next load, before anything renders', async () => {
    const store = await freshStore()
    store.getState().toggleTheme()
    expect(localStorage.getItem('stratmap_theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    document.documentElement.removeAttribute('data-theme') // a reload starts with a clean page
    const reloaded = await freshStore()
    expect(reloaded.getState().isDark).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('choosing dark again is remembered too', async () => {
    const store = await freshStore()
    store.getState().toggleTheme()
    store.getState().toggleTheme()
    expect(localStorage.getItem('stratmap_theme')).toBe('dark')
    expect((await freshStore()).getState().isDark).toBe(true)
  })

  it('unreadable or unwritable storage falls back to dark and still toggles', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const store = await freshStore()
    expect(store.getState().isDark).toBe(true)
    expect(() => store.getState().toggleTheme()).not.toThrow()
    expect(store.getState().isDark).toBe(false)
    getItem.mockRestore(); setItem.mockRestore()
  })
})
