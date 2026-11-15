// Launch review R-42 item 1, the rendered half for pages: render the app layout and every page in a signed-in workspace and fail on any
// button, link, form field or role="button" with an empty accessible name (computed the way a browser does, dom-accessibility-api).
// The source scanners cannot see a <button> that a helper component builds from props; this one can.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { computeAccessibleName } from 'dom-accessibility-api'

vi.mock('../lib/apiClient', () => {
  class ApiError extends Error { body: Record<string, unknown> = {}; get userMessage() { return this.message } }
  const empty = () => Promise.resolve([])
  // Routes whose reply is an object the page reads from; everything else is an empty list.
  const replies: Array<[string, unknown]> = [
    ['/api/workspace/onboarding', { steps: { chart: false, invite: false, share: false }, complete: false, dismissed: false }],
    ['/api/workspace/invites', { invites: [] }],
    ['/api/workspace/audit', { events: [], nextBefore: null }],
    ['/api/notifications', { comments: true }],
    ['/api/workspace', { members: [], invites: [] }],
  ]
  const get = (path: string) => Promise.resolve(replies.find(([p]) => path.startsWith(p))?.[1] ?? [])
  return { ApiError, api: { get: vi.fn(get), post: vi.fn(empty), put: vi.fn(empty), delete: vi.fn(empty), getText: vi.fn(() => Promise.resolve('')) } }
})
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ user: { id: 'u1', fullName: 'Ada Lovelace', imageUrl: '', primaryEmailAddress: { emailAddress: 'ada@example.com' } }, isLoaded: true, isSignedIn: true }),
  useAuth: () => ({ isSignedIn: true, isLoaded: true, getToken: async () => 't', signOut: async () => {} }),
  useClerk: () => ({ signOut: async () => {}, openUserProfile: () => {} }),
  SignIn: () => null, SignUp: () => null,
}))

import { Layout } from '../components/layout/Layout'
import { Dashboard } from '../pages/Dashboard'
import { ChartView } from '../pages/ChartView'
import { RolesView } from '../pages/RolesView'
import { HeadcountView } from '../pages/HeadcountView'
import { SettingsView } from '../pages/SettingsView'
import { PricingPage } from '../pages/PricingPage'
import { LandingPage } from '../pages/LandingPage'
import { PrivacyPage, TermsPage } from '../pages/LegalPages'
import { NotFoundPage } from '../pages/NotFoundPage'
import { useUserStore } from '../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../store/billingStore'
import { useChartStore } from '../store/chartStore'
import { installMatchMedia, setScreen, removeMatchMedia } from './matchMedia'

const FIELDS = 'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="menuitem"], input:not([type="hidden"]), select, textarea'

function unnamed(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>(FIELDS)]
    .filter(el => !el.closest('[aria-hidden="true"], [inert]'))
    .filter(el => !computeAccessibleName(el).trim())
    .map(el => `<${el.tagName.toLowerCase()}> ${el.outerHTML.slice(0, 140)}`)
}

const PAGES: Array<[string, string, () => React.ReactElement, boolean]> = [
  // [name, path, element, inside the app layout]
  ['Dashboard', '/dashboard', () => <Dashboard />, true],
  ['Charts', '/charts', () => <ChartView />, true],
  ['Roles', '/roles', () => <RolesView />, true],
  ['Headcount', '/headcount', () => <HeadcountView />, true],
  ['Settings', '/settings', () => <SettingsView />, true],
  ['Pricing', '/pricing', () => <PricingPage />, true],
  ['Landing page', '/', () => <LandingPage />, false],
  ['Privacy', '/privacy', () => <PrivacyPage />, false],
  ['Terms', '/terms', () => <TermsPage />, false],
  ['Not found', '/nope', () => <NotFoundPage />, false],
]

beforeEach(() => {
  installMatchMedia(); setScreen('desktop')
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  useUserStore.setState({ permission: 'owner' })
  useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
  useChartStore.setState({
    charts: [{ id: 'c1', name: 'Current structure', status: 'draft', version: 1, nodeCount: 3, deptCount: 1, isPublic: false, isSample: false, owner: 'Ada', creator: 'Ada', collaborators: ['AL'], departments: [], nodes: [], edges: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never],
    loaded: true, loading: false, error: false,
  })
})
afterEach(removeMatchMedia)

describe('every page has accessible names on its controls (rendered)', () => {
  it('the scanner itself catches an unnamed button', () => {
    const { container } = render(<div><button><svg /></button><button aria-label="ok"><svg /></button></div>)
    expect(unnamed(container)).toHaveLength(1)
  })

  it.each(PAGES)('%s', async (_name, path, element, inLayout) => {
    const { container } = render(<MemoryRouter initialEntries={[path]}>{inLayout ? <Layout>{element()}</Layout> : element()}</MemoryRouter>)
    await new Promise(r => setTimeout(r, 50)) // let the mocked fetches settle
    expect(unnamed(container), `\n${unnamed(container).join('\n')}\n`).toEqual([])
  })

  it('the settings tabs, one by one', async () => {
    const { container } = render(<MemoryRouter initialEntries={['/settings']}><SettingsView /></MemoryRouter>)
    await new Promise(r => setTimeout(r, 50))
    const names = ['General', 'Members', 'Billing', 'Notifications', 'Activity']
    let visited = 0
    for (const n of names) {
      const tab = screen.queryByRole('button', { name: n })
      if (!tab) continue
      visited++
      fireEvent.click(tab)
      await new Promise(r => setTimeout(r, 40))
      expect(unnamed(container), n).toEqual([])
    }
    expect(visited, 'the scan found the settings tabs').toBe(names.length)
  })
})
