import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isKnownPath, pageAccess, KNOWN_ROUTES } from '../routes'

describe('isKnownPath (R-15)', () => {
  it.each(['/', '/dashboard', '/charts', '/charts/abc-123', '/roles', '/headcount', '/settings', '/pricing', '/privacy', '/terms',
    '/share/AbC123', '/embed/AbC123', '/invite/tok', '/sign-in', '/sign-in/factor-one', '/sign-up', '/sign-up/verify', '/onboarding', '/billing/success',
    '/charts/', '/dashboard/'])('%s is a page', p => expect(isKnownPath(p)).toBe(true))

  it.each(['/nope', '/dashboard/extra', '/charts/a/b', '/settings/x', '/share', '/embed', '/invite', '/billing', '/wp-admin', '/app.html'])(
    '%s has no page', p => expect(isKnownPath(p)).toBe(false))

  it('covers every route App.tsx declares, so a new page cannot be mistaken for a 404', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    const declared = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1]).filter(p => p !== '*')
    expect(declared.length).toBeGreaterThan(10)
    for (const path of declared) {
      expect(KNOWN_ROUTES as readonly string[], `App.tsx has ${path} but KNOWN_ROUTES (src/lib/routes.ts) does not`).toContain(path)
    }
    for (const path of KNOWN_ROUTES) expect(declared, `KNOWN_ROUTES lists ${path}, which App.tsx does not declare`).toContain(path)
  })
})

describe('pageAccess: how AuthProvider treats a URL', () => {
  it('auth screens and public pages are as before', () => {
    expect(pageAccess('/sign-in')).toMatchObject({ isAuthPage: true, isPublicPage: false })
    expect(pageAccess('/sign-up/x')).toMatchObject({ isAuthPage: true })
    for (const p of ['/', '/privacy', '/terms', '/share/abc', '/embed/abc', '/invite/tok']) expect(pageAccess(p), p).toMatchObject({ isPublicPage: true, isAuthPage: false })
  })
  it('pricing is open to everyone but loads the workspace of a signed-in person', () => {
    expect(pageAccess('/pricing')).toEqual({ isAuthPage: false, isPublicPage: false, isOptionalAuthPage: true })
  })
  it('app pages are private: a signed-out visitor is sent to sign-in', () => {
    for (const p of ['/dashboard', '/charts', '/charts/abc', '/roles', '/headcount', '/settings', '/onboarding', '/billing/success']) {
      expect(pageAccess(p), p).toEqual({ isAuthPage: false, isPublicPage: false, isOptionalAuthPage: false })
    }
  })
  it('a URL with no page is open, so the 404 page shows instead of a bounce to sign-in', () => {
    expect(pageAccess('/this-does-not-exist')).toEqual({ isAuthPage: false, isPublicPage: false, isOptionalAuthPage: true })
    expect(pageAccess('/dashboard/extra').isOptionalAuthPage).toBe(true)
  })
})
