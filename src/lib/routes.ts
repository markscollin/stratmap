import { matchPath } from 'react-router-dom'

/** Every page the app has (the `<Route path>`s in App.tsx; a test keeps the two in step). */
export const KNOWN_ROUTES = [
  '/', '/share/:token', '/embed/:code', '/privacy', '/pricing', '/terms', '/invite/:token',
  '/sign-in/*', '/sign-up/*', '/onboarding',
  '/dashboard', '/charts', '/charts/:id', '/roles', '/headcount', '/settings', '/billing/success',
] as const

/** False for a URL the app has no page for. Those show the 404 page, and must not be bounced to sign-in first (R-15). */
export function isKnownPath(pathname: string): boolean {
  return KNOWN_ROUTES.some(path => matchPath({ path, end: true }, pathname) !== null)
}

export interface PageAccess {
  /** Sign-in and sign-up: the auth screens themselves. */
  isAuthPage: boolean
  /** Needs no account and loads nothing about one: landing, legal, share, embed, invite links. */
  isPublicPage: boolean
  /** Open to everyone, but a signed-in person still gets their workspace and plan loaded: pricing, and any URL with no page. */
  isOptionalAuthPage: boolean
}

/** How `AuthProvider` treats a URL. Everything not listed here sends a signed-out visitor to sign-in. */
export function pageAccess(pathname: string): PageAccess {
  return {
    isAuthPage: pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up'),
    isPublicPage: pathname === '/' || pathname.startsWith('/share') || pathname.startsWith('/embed/') || pathname.startsWith('/privacy')
      || pathname.startsWith('/terms') || pathname.startsWith('/invite/'),
    isOptionalAuthPage: pathname === '/pricing' || !isKnownPath(pathname),
  }
}
