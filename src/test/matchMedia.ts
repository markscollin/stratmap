// A controllable window.matchMedia for tests (jsdom has none). `setScreen('phone' | 'desktop')` flips
// every "(max-width: 767px)" query and notifies listeners, like resizing the browser would.
import { act } from '@testing-library/react'

type Listener = () => void
const listeners = new Set<Listener>()
let phone = false

export function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() { return /max-width:\s*767px/.test(query) ? phone : false },
      media: query,
      addEventListener: (_: string, l: Listener) => listeners.add(l),
      removeEventListener: (_: string, l: Listener) => listeners.delete(l),
      addListener: (l: Listener) => listeners.add(l),
      removeListener: (l: Listener) => listeners.delete(l),
      dispatchEvent: () => true,
      onchange: null,
    }),
  })
}

export function setScreen(kind: 'phone' | 'desktop') {
  phone = kind === 'phone'
  act(() => { listeners.forEach(l => l()) })
}

export function removeMatchMedia() {
  phone = false
  listeners.clear()
  // @ts-expect-error restoring "no matchMedia", as in jsdom
  delete window.matchMedia
}
