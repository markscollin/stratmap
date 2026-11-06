import { useSyncExternalStore } from 'react'

/** Phones. Below this width the app switches to its mobile layout (roadmap 2.8): drawer navigation and a view-only canvas. */
export const PHONE_QUERY = '(max-width: 767px)'

/** Live result of a CSS media query. False where matchMedia doesn't exist (tests, very old browsers). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mq = window.matchMedia(query)
      mq.addEventListener('change', notify)
      return () => mq.removeEventListener('change', notify)
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  )
}

export const useIsPhone = () => useMediaQuery(PHONE_QUERY)
