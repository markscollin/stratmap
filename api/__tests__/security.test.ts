// Phase 0 security & integrity tests: server-side role enforcement, privilege
// escalation, salary redaction, plan limits, AI quota, share links, input
// validation and rate limiting. See docs/ROADMAP_TO_PRODUCTION.md (Phase 0).
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

vi.mock('../_lib/auth', () => ({
  requireAuth: vi.fn(),
  requireUser: vi.fn(),
}))

vi.mock('../_lib/email', () => ({
  sendWorkspaceInvite: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: () => ({
        on: (event: string, cb: (t: string) => void) => { if (event === 'text') cb('RESPONSIBILITIES:\n- x') },
        finalMessage: async () => ({}),
      }),
    }
  },
}))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { hitRateLimit } from '../_lib/rateLimit'
import chartsHandler from '../charts/index'
import chartHandler from '../charts/[id]'
import nodesHandler from '../charts/[id]/nodes'
import nodeHandler from '../charts/[id]/nodes/[nodeId]'
import edgesHandler from '../charts/[id]/edges'
import edgeHandler from '../charts/[id]/edges/[edgeId]'
import jdHandler from '../charts/[id]/jd/[nodeId]'
import shareHandler from '../charts/[id]/share'
import publicShareHandler from '../share/[code]'
import templatesHandler from '../templates'
import templateHandler from '../templates/[id]'
import headcountHandler from '../headcount'
import headcountItemHandler from '../headcount/[id]'
import departmentsHandler from '../workspace/departments'
import departmentHandler from '../workspace/departments/[id]'
import workspaceHandler from '../workspace'
import memberHandler from '../workspace/members/[userId]'
import invitesHandler from '../workspace/invites'
import checkoutHandler from '../checkout'
import aiDraftHandler from '../ai/draft'
import grantTrialHandler from '../admin/grant-trial'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, seedEdge, seedWorkspaceDept,
  seedHeadcountPlan, seedMember, testDb,
  TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID, TEST_EDGE_ID, TEST_DEPT_ID, TEST_PLAN_ID,
} from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Role = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'
type Handler = (req: VercelRequest, res: VercelResponse) => unknown

const ACTOR = 'u-actor'
const TARGET = 'u-target'
const TEMPLATE_ID = 'tmpl-1'
const ROLES: Role[] = ['viewer', 'commenter', 'editor', 'admin', 'owner']

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()            // u-test is owner
  await seedChart()
  await seedNode()
  await seedEdge()
  await seedWorkspaceDept()
  await seedHeadcountPlan()
  await testDb.insert(schema.roleTemplates).values({
    id: TEMPLATE_ID, workspaceId: TEST_WS_ID, title: 'Engineer', department: 'Eng',
    createdBy: 'u-test', updatedBy: 'u-test',
  })
  await setTier('growth')
  process.env.ANTHROPIC_API_KEY = 'sk-test'
  vi.mocked(requireAuth).mockResolvedValue({ userId: ACTOR, workspaceId: TEST_WS_ID })
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ADMIN_SECRET
})

async function setTier(tier: 'free' | 'starter' | 'growth' | 'enterprise') {
  await testDb.update(schema.workspaces).set({ planTier: tier }).where(eq(schema.workspaces.id, TEST_WS_ID))
}

/** Seeds ACTOR with `role` — the access layer resolves it from the DB (no permission on the mock). */
async function actAs(role: Role) {
  if (role === 'owner') {
    await testDb.update(schema.workspaceMembers).set({ permission: 'admin' }).where(eq(schema.workspaceMembers.userId, 'u-test'))
  }
  await seedMember(ACTOR, role)
}

async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}

// ─── Role matrix ─────────────────────────────────────────────────────────────

interface RouteCase {
  name: string
  handler: Handler
  method: string
  query?: Record<string, string>
  body?: unknown
  min: Role
  /** Extra setup run before the call (e.g. seeding a member to act on). */
  setup?: () => Promise<void>
}

const c = { id: TEST_CHART_ID }
const ROUTES: RouteCase[] = [
  { name: 'create chart', handler: chartsHandler, method: 'POST', body: { name: 'New' }, min: 'editor' },
  { name: 'rename chart', handler: chartHandler, method: 'PUT', query: c, body: { name: 'X' }, min: 'editor' },
  { name: 'make chart public', handler: chartHandler, method: 'PUT', query: c, body: { isPublic: true }, min: 'editor' },
  { name: 'delete chart', handler: chartHandler, method: 'DELETE', query: c, min: 'admin' },
  { name: 'approve chart', handler: chartHandler, method: 'PUT', query: c, body: { status: 'approved' }, min: 'admin' },
  { name: 'request changes on a chart', handler: chartHandler, method: 'PUT', query: c, body: { status: 'rejected' }, min: 'admin' },
  { name: 'publish chart (live)', handler: chartHandler, method: 'PUT', query: c, body: { status: 'live' }, min: 'admin' },
  { name: 'submit chart for review', handler: chartHandler, method: 'PUT', query: c, body: { status: 'review' }, min: 'editor' },
  { name: 'create chart already live', handler: chartsHandler, method: 'POST', body: { name: 'New', status: 'live' }, min: 'admin' },
  { name: 'add node', handler: nodesHandler, method: 'POST', query: c, body: { name: 'N', title: 'T', x: 0, y: 0 }, min: 'editor' },
  { name: 'move nodes', handler: nodesHandler, method: 'PUT', query: c, body: [{ id: TEST_NODE_ID, x: 1, y: 1 }], min: 'editor' },
  { name: 'edit node', handler: nodeHandler, method: 'PUT', query: { ...c, nodeId: TEST_NODE_ID }, body: { title: 'VP' }, min: 'editor' },
  { name: 'delete node', handler: nodeHandler, method: 'DELETE', query: { ...c, nodeId: TEST_NODE_ID }, min: 'editor' },
  { name: 'add edge', handler: edgesHandler, method: 'POST', query: c, body: { sourceId: 'node-b', targetId: TEST_NODE_ID }, min: 'editor' },
  { name: 'delete edge', handler: edgeHandler, method: 'DELETE', query: { ...c, edgeId: TEST_EDGE_ID }, min: 'editor' },
  { name: 'edit JD', handler: jdHandler, method: 'PUT', query: { ...c, nodeId: TEST_NODE_ID }, body: { responsibilities: 'x' }, min: 'editor' },
  { name: 'edit salary band', handler: jdHandler, method: 'PUT', query: { ...c, nodeId: TEST_NODE_ID }, body: { salaryBandMin: 100 }, min: 'admin' },
  { name: 'approve JD', handler: jdHandler, method: 'PUT', query: { ...c, nodeId: TEST_NODE_ID }, body: { status: 'approved' }, min: 'admin' },
  { name: 'create share link', handler: shareHandler, method: 'POST', query: c, min: 'editor' },
  { name: 'revoke share link', handler: shareHandler, method: 'DELETE', query: c, min: 'editor' },
  { name: 'create template', handler: templatesHandler, method: 'POST', body: { title: 'PM' }, min: 'editor' },
  { name: 'edit template', handler: templateHandler, method: 'PUT', query: { id: TEMPLATE_ID }, body: { title: 'PM' }, min: 'editor' },
  { name: 'delete template', handler: templateHandler, method: 'DELETE', query: { id: TEMPLATE_ID }, min: 'editor' },
  { name: 'create headcount', handler: headcountHandler, method: 'POST', body: { title: 'SE', targetQuarter: '2026-Q3' }, min: 'editor' },
  { name: 'edit headcount', handler: headcountItemHandler, method: 'PUT', query: { id: TEST_PLAN_ID }, body: { title: 'SE2' }, min: 'editor' },
  { name: 'approve headcount', handler: headcountItemHandler, method: 'PUT', query: { id: TEST_PLAN_ID }, body: { status: 'approved' }, min: 'admin' },
  { name: 'delete headcount', handler: headcountItemHandler, method: 'DELETE', query: { id: TEST_PLAN_ID }, min: 'editor' },
  { name: 'create department', handler: departmentsHandler, method: 'POST', body: { name: 'Ops', colour: '#fff' }, min: 'editor' },
  { name: 'edit department', handler: departmentHandler, method: 'PUT', query: { id: TEST_DEPT_ID }, body: { name: 'Ops' }, min: 'editor' },
  { name: 'delete department', handler: departmentHandler, method: 'DELETE', query: { id: TEST_DEPT_ID }, min: 'editor' },
  { name: 'rename workspace', handler: workspaceHandler, method: 'PUT', body: { name: 'New name' }, min: 'admin' },
  {
    name: 'change member role', handler: memberHandler, method: 'PUT', query: { userId: TARGET },
    body: { permission: 'commenter' }, min: 'admin', setup: () => seedMember(TARGET, 'viewer'),
  },
  {
    name: 'remove member', handler: memberHandler, method: 'DELETE', query: { userId: TARGET },
    min: 'admin', setup: () => seedMember(TARGET, 'viewer'),
  },
  { name: 'invite member', handler: invitesHandler, method: 'POST', body: { invites: [{ email: 'new@co.com', permission: 'viewer' }] }, min: 'admin' },
  { name: 'start checkout', handler: checkoutHandler, method: 'POST', body: { tier: 'starter', billingCycle: 'monthly' }, min: 'admin' },
  { name: 'AI draft', handler: aiDraftHandler, method: 'POST', body: { title: 'SE', deptName: 'Eng' }, min: 'editor' },
]

describe('server-side role enforcement', () => {
  for (const route of ROUTES) {
    const minRank = ROLES.indexOf(route.min)
    const denied = ROLES.slice(0, minRank)
    const allowed = ROLES.slice(minRank)

    for (const role of denied) {
      it(`${route.name}: ${role} → 403`, async () => {
        await actAs(role)
        await route.setup?.()
        const res = await call(route.handler, { method: route.method, query: route.query, body: route.body })
        expect(res._status).toBe(403)
      })
    }

    it(`${route.name}: ${allowed[0]} → allowed`, async () => {
      await actAs(allowed[0])
      await route.setup?.()
      const res = await call(route.handler, { method: route.method, query: route.query, body: route.body })
      expect(res._status).not.toBe(403)
      expect(res._status).toBeLessThan(500)
    })
  }

  it('viewers can still read charts, JDs and templates', async () => {
    await actAs('viewer')
    expect((await call(chartsHandler, { method: 'GET' }))._status).toBe(200)
    expect((await call(chartHandler, { method: 'GET', query: c }))._status).toBe(200)
    expect((await call(jdHandler, { method: 'GET', query: { ...c, nodeId: TEST_NODE_ID } }))._status).toBe(200)
    expect((await call(templatesHandler, { method: 'GET' }))._status).toBe(200)
  })
})

// Launch review R-08: editors could approve and publish charts by calling the API directly.
describe('chart status changes are the approvers\' decision', () => {
  const setStatus = (status: string) => testDb.update(schema.charts).set({ status: status as never }).where(eq(schema.charts.id, TEST_CHART_ID))
  const put = (status: string) => call(chartHandler, { method: 'PUT', query: c, body: { status } })
  const statusNow = async () => (await testDb.select({ s: schema.charts.status }).from(schema.charts))[0].s

  it('an editor cannot approve, reject or publish, and the chart is left as it was', async () => {
    await actAs('editor')
    for (const status of ['approved', 'rejected', 'live']) {
      expect((await put(status))._status, status).toBe(403)
    }
    expect(await statusNow()).toBe('draft')
  })

  it('an admin can: editor → live is 403 where admin → live is 200', async () => {
    await actAs('editor')
    expect((await put('live'))._status).toBe(403)
    await testDb.delete(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, ACTOR))
    await actAs('admin')
    expect((await put('live'))._status).toBe(200)
    expect(await statusNow()).toBe('live')
  })

  it('an editor cannot pull a chart back out of approved or live (revise, retire, anything)', async () => {
    await actAs('editor')
    for (const from of ['approved', 'live']) {
      await setStatus(from)
      for (const to of ['draft', 'editing', 'review', 'archived']) {
        expect((await put(to))._status, `${from} → ${to}`).toBe(403)
      }
      expect(await statusNow()).toBe(from)
    }
  })

  it('an editor can still draft, edit, submit for review, archive and revise after changes were requested', async () => {
    await actAs('editor')
    for (const status of ['editing', 'review', 'draft', 'archived']) expect((await put(status))._status, status).toBe(200)
    await setStatus('rejected')
    expect((await put('editing'))._status).toBe(200)
  })

  it('sending the status a chart already has is not a change, so an editor can still rename a live chart', async () => {
    await actAs('editor')
    await setStatus('live')
    expect((await call(chartHandler, { method: 'PUT', query: c, body: { name: 'Renamed', status: 'live' } }))._status).toBe(200)
  })

  it('an editor cannot create a chart that starts approved, rejected or live; review is fine', async () => {
    await actAs('editor')
    await testDb.delete(schema.charts) // keep within the chart limit; the check under test comes before it
    for (const status of ['approved', 'rejected', 'live']) {
      expect((await call(chartsHandler, { method: 'POST', body: { name: 'Sneaky', status } }))._status, status).toBe(403)
    }
    expect((await call(chartsHandler, { method: 'POST', body: { name: 'Fine', status: 'review' } }))._status).toBe(201)
  })

  it('an owner can do all of it', async () => {
    await actAs('owner')
    expect((await put('approved'))._status).toBe(200)
    expect((await put('live'))._status).toBe(200)
    expect((await put('editing'))._status).toBe(200)
  })
})

// ─── Privilege escalation ────────────────────────────────────────────────────

describe('privilege escalation guards', () => {
  it('nobody can grant owner — not even the owner', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-test', workspaceId: TEST_WS_ID })
    await seedMember(TARGET, 'viewer')
    const res = await call(memberHandler, { method: 'PUT', query: { userId: TARGET }, body: { permission: 'owner' } })
    expect(res._status).toBe(403)
  })

  it('owner can promote a member to admin', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-test', workspaceId: TEST_WS_ID })
    await seedMember(TARGET, 'viewer')
    const res = await call(memberHandler, { method: 'PUT', query: { userId: TARGET }, body: { permission: 'admin' } })
    expect(res._status).toBe(200)
  })

  it('an admin cannot promote someone to admin', async () => {
    await actAs('admin')
    await seedMember(TARGET, 'viewer')
    const res = await call(memberHandler, { method: 'PUT', query: { userId: TARGET }, body: { permission: 'admin' } })
    expect(res._status).toBe(403)
  })

  it('an admin cannot demote or remove another admin', async () => {
    await actAs('admin')
    await seedMember(TARGET, 'admin')
    expect((await call(memberHandler, { method: 'PUT', query: { userId: TARGET }, body: { permission: 'viewer' } }))._status).toBe(403)
    expect((await call(memberHandler, { method: 'DELETE', query: { userId: TARGET } }))._status).toBe(403)
  })

  it('an admin cannot change their own role', async () => {
    await actAs('admin')
    const res = await call(memberHandler, { method: 'PUT', query: { userId: ACTOR }, body: { permission: 'viewer' } })
    expect(res._status).toBe(403)
  })

  it('the owner cannot be modified or removed', async () => {
    await actAs('admin')
    expect((await call(memberHandler, { method: 'DELETE', query: { userId: 'u-test' } }))._status).toBe(403)
  })

  it('invites cannot grant owner, and admins cannot invite admins', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-test', workspaceId: TEST_WS_ID })
    const asOwner = await call(invitesHandler, { method: 'POST', body: { invites: [{ email: 'x@co.com', permission: 'owner' }] } })
    expect(asOwner._status).toBe(403)

    vi.mocked(requireAuth).mockResolvedValue({ userId: ACTOR, workspaceId: TEST_WS_ID })
    await actAs('admin')
    const asAdmin = await call(invitesHandler, { method: 'POST', body: { invites: [{ email: 'y@co.com', permission: 'admin' }] } })
    expect(asAdmin._status).toBe(403)
    expect(await testDb.select().from(schema.pendingInvites)).toHaveLength(0)
  })
})

// ─── Salary confidentiality ──────────────────────────────────────────────────

describe('salary band confidentiality', () => {
  beforeEach(async () => {
    await testDb.insert(schema.jobDescriptions).values({
      id: 'jd-1', nodeId: TEST_NODE_ID, chartId: TEST_CHART_ID, updatedBy: 'u-test',
      salaryBandMin: 100000, salaryBandMax: 150000, salaryCurrency: 'USD',
    })
  })

  const jdQuery = { id: TEST_CHART_ID, nodeId: TEST_NODE_ID }

  for (const role of ['viewer', 'commenter', 'editor'] as Role[]) {
    it(`${role} does not receive salary fields`, async () => {
      await actAs(role)
      const res = await call(jdHandler, { method: 'GET', query: jdQuery })
      expect(res._status).toBe(200)
      const body = res._body as Record<string, unknown>
      expect(body).not.toHaveProperty('salaryBandMin')
      expect(body).not.toHaveProperty('salaryBandMax')
      expect(body).not.toHaveProperty('salaryCurrency')
    })
  }

  it('editor JD updates do not leak salary in the response', async () => {
    await actAs('editor')
    const res = await call(jdHandler, { method: 'PUT', query: jdQuery, body: { responsibilities: 'new' } })
    expect(res._status).toBe(200)
    expect(res._body).not.toHaveProperty('salaryBandMin')
  })

  it('admin receives and can edit salary fields', async () => {
    await actAs('admin')
    const get = await call(jdHandler, { method: 'GET', query: jdQuery })
    expect((get._body as Record<string, unknown>).salaryBandMin).toBe(100000)
    const put = await call(jdHandler, { method: 'PUT', query: jdQuery, body: { salaryBandMax: 160000 } })
    expect(put._status).toBe(200)
    expect((put._body as Record<string, unknown>).salaryBandMax).toBe(160000)
  })
})

// ─── Plan limits ─────────────────────────────────────────────────────────────

describe('server-side plan limits', () => {
  beforeEach(async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-test', workspaceId: TEST_WS_ID })
    await setTier('free')
  })

  it('free plan: second chart → 402 plan-limit', async () => {
    const res = await call(chartsHandler, { method: 'POST', body: { name: 'Second' } })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ error: 'plan-limit', limit: 'charts', max: 1, tier: 'free' })
  })

  it('an active admin trial lifts the limit', async () => {
    const future = new Date(Date.now() + 86_400_000)
    await testDb.update(schema.workspaces).set({ trialPlan: 'growth', trialEndsAt: future })
    const res = await call(chartsHandler, { method: 'POST', body: { name: 'Second' } })
    expect(res._status).toBe(201)
  })

  it('free plan: template larger than the node limit → 402', async () => {
    await testDb.delete(schema.charts)
    const templateNodes = Array.from({ length: 31 }, (_, i) => ({ id: `n${i}`, name: 'P', title: 'T', x: 0, y: 0 }))
    const res = await call(chartsHandler, { method: 'POST', body: { name: 'Big', templateNodes } })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ limit: 'nodes', max: 30 })
  })

  it('free plan: 31st node → 402', async () => {
    // The chart already has 2 nodes (seedNode + seedEdge); add 28 more to reach 30.
    await testDb.insert(schema.nodes).values(
      Array.from({ length: 28 }, (_, i) => ({ id: `fill-${i}`, chartId: TEST_CHART_ID, name: 'P', title: 'T', x: 0, y: 0 })),
    )
    const res = await call(nodesHandler, { method: 'POST', query: c, body: { name: 'One too many', title: 'T', x: 0, y: 0 } })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ limit: 'nodes', max: 30 })
  })

  it('free plan: invites beyond 3 seats (members + pending) → 402', async () => {
    const res = await call(invitesHandler, {
      method: 'POST',
      body: { invites: ['a', 'b', 'c'].map(n => ({ email: `${n}@co.com`, permission: 'editor' })) },
    })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ limit: 'seats', max: 3 })

    const ok = await call(invitesHandler, {
      method: 'POST',
      body: { invites: ['a', 'b'].map(n => ({ email: `${n}@co.com`, permission: 'editor' })) },
    })
    expect(ok._status).toBe(201)
  })

  it('re-inviting an existing invitee does not consume another seat', async () => {
    const body = { invites: [{ email: 'a@co.com', permission: 'editor' }] }
    expect((await call(invitesHandler, { method: 'POST', body }))._status).toBe(201)
    const again = await call(invitesHandler, { method: 'POST', body })
    expect(again._status).toBe(201)
    expect(await testDb.select().from(schema.pendingInvites)).toHaveLength(1)
  })
})

// ─── AI quota ────────────────────────────────────────────────────────────────

describe('AI drafting quota', () => {
  const body = { title: 'SE', deptName: 'Eng' }

  beforeEach(() => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-test', workspaceId: TEST_WS_ID })
    process.env.ANTHROPIC_API_KEY = 'sk-test'
  })

  it('starter: 3 drafts per month, then 402', async () => {
    await setTier('starter')
    for (let i = 0; i < 3; i++) {
      const res = await call(aiDraftHandler, { method: 'POST', body })
      expect(res._written).toContain('RESPONSIBILITIES')
    }
    const res = await call(aiDraftHandler, { method: 'POST', body })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ error: 'plan-limit', limit: 'ai-drafts', max: 3 })

    const [usage] = await testDb.select().from(schema.aiUsage)
    expect(usage.count).toBe(3)
  })

  it('growth: unlimited drafts are still counted', async () => {
    for (let i = 0; i < 4; i++) {
      const res = await call(aiDraftHandler, { method: 'POST', body })
      expect(res._written).toContain('RESPONSIBILITIES')
    }
    const [usage] = await testDb.select().from(schema.aiUsage)
    expect(usage.count).toBe(4)
  })

  it('a burst of more than 10 drafts per minute → 429', async () => {
    for (let i = 0; i < 10; i++) await call(aiDraftHandler, { method: 'POST', body })
    const res = await call(aiDraftHandler, { method: 'POST', body })
    expect(res._status).toBe(429)
    expect(res._headers['Retry-After']).toBeDefined()
  })
})

// ─── Share links ─────────────────────────────────────────────────────────────

describe('public share links', () => {
  beforeEach(() => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-test', workspaceId: TEST_WS_ID })
  })

  async function createLink(): Promise<string> {
    const res = await call(shareHandler, { method: 'POST', query: c })
    return (res._body as { code: string }).code
  }

  it('generates 16-char URL-safe codes (≤ 20 so SharePage treats them as short codes)', async () => {
    const code = await createLink()
    expect(code).toMatch(/^[A-Za-z0-9_-]{16}$/)
  })

  it('a link only resolves while the chart is public', async () => {
    const code = await createLink()
    const privateRes = await call(publicShareHandler, { method: 'GET', query: { code } })
    expect(privateRes._status).toBe(404)

    await testDb.update(schema.charts).set({ isPublic: true })
    const publicRes = await call(publicShareHandler, { method: 'GET', query: { code } })
    expect(publicRes._status).toBe(200)
    const body = publicRes._body as { nodes: Record<string, unknown>[] }
    expect(body.nodes[0]).not.toHaveProperty('chartId')

    await testDb.update(schema.charts).set({ isPublic: false })
    expect((await call(publicShareHandler, { method: 'GET', query: { code } }))._status).toBe(404)
  })

  it('rejects malformed codes without querying', async () => {
    const res = await call(publicShareHandler, { method: 'GET', query: { code: "x' OR 1=1 --" } })
    expect(res._status).toBe(404)
  })

  it('throttles lookups per IP (60/min)', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.9' }
    for (let i = 0; i < 60; i++) await call(publicShareHandler, { method: 'GET', query: { code: 'nope' }, headers })
    const res = await call(publicShareHandler, { method: 'GET', query: { code: 'nope' }, headers })
    expect(res._status).toBe(429)
    const other = await call(publicShareHandler, { method: 'GET', query: { code: 'nope' }, headers: { 'x-forwarded-for': '198.51.100.1' } })
    expect(other._status).toBe(404)
  })
})

// ─── Input validation ────────────────────────────────────────────────────────

describe('input validation & mass assignment', () => {
  beforeEach(() => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-test', workspaceId: TEST_WS_ID })
  })

  it('node create ignores a smuggled chartId', async () => {
    await testDb.insert(schema.charts).values({
      id: 'other-chart', workspaceId: TEST_WS_ID, name: 'Other', ownerId: 'u-test', creatorId: 'u-test', version: 1,
    })
    const res = await call(nodesHandler, {
      method: 'POST', query: c, body: { id: 'smuggle', name: 'N', title: 'T', x: 0, y: 0, chartId: 'other-chart' },
    })
    expect(res._status).toBe(201)
    expect((res._body as { chartId: string }).chartId).toBe(TEST_CHART_ID)
  })

  it('rejects bad enum values, bad ids and oversized fields with 400', async () => {
    const bad = [
      { name: 'N', title: 'T', x: 0, y: 0, status: 'ceo-mode' },
      { name: 'N', title: 'T', x: 0, y: 0, id: '../../etc' },
      { name: 'x'.repeat(201), title: 'T', x: 0, y: 0 },
      { name: 'N', title: 'T', x: 'left', y: 0 },
    ]
    for (const body of bad) {
      const res = await call(nodesHandler, { method: 'POST', query: c, body })
      expect(res._status).toBe(400)
      expect(res._body).toMatchObject({ error: 'invalid-request' })
    }
  })

  it('edges must connect nodes in the same chart', async () => {
    await testDb.insert(schema.charts).values({
      id: 'other-chart', workspaceId: TEST_WS_ID, name: 'Other', ownerId: 'u-test', creatorId: 'u-test', version: 1,
    })
    await testDb.insert(schema.nodes).values({ id: 'foreign', chartId: 'other-chart', name: 'F', title: 'T', x: 0, y: 0 })
    const res = await call(edgesHandler, { method: 'POST', query: c, body: { sourceId: TEST_NODE_ID, targetId: 'foreign' } })
    expect(res._status).toBe(400)
    const self = await call(edgesHandler, { method: 'POST', query: c, body: { sourceId: TEST_NODE_ID, targetId: TEST_NODE_ID } })
    expect(self._status).toBe(400)
  })

  it('template seeding drops edges that point outside the template', async () => {
    const res = await call(chartsHandler, {
      method: 'POST',
      body: {
        name: 'T',
        templateNodes: [{ id: 'a', name: 'A', title: 'T', x: 0, y: 0 }],
        templateEdges: [{ sourceId: 'a', targetId: TEST_NODE_ID }],
      },
    })
    expect(res._status).toBe(201)
    const newChartId = (res._body as { id: string }).id
    expect(await testDb.select().from(schema.edges).where(eq(schema.edges.chartId, newChartId))).toHaveLength(0)
  })

  it('JD rejects an invalid currency code', async () => {
    const res = await call(jdHandler, { method: 'PUT', query: { ...c, nodeId: TEST_NODE_ID }, body: { salaryCurrency: 'dollars' } })
    expect(res._status).toBe(400)
  })
})

// ─── Rate limiter & admin endpoint ───────────────────────────────────────────

describe('rate limiter', () => {
  it('counts within a window and resets in the next', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      expect((await hitRateLimit('k', 2, 60)).allowed).toBe(true)
      expect((await hitRateLimit('k', 2, 60)).allowed).toBe(true)
      const third = await hitRateLimit('k', 2, 60)
      expect(third.allowed).toBe(false)
      expect(third.retryAfterSeconds).toBe(60)

      vi.setSystemTime(new Date('2026-01-01T00:01:00Z'))
      const fresh = await hitRateLimit('k', 2, 60)
      expect(fresh).toMatchObject({ allowed: true, count: 1 })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('admin grant-trial', () => {
  it('rejects a wrong secret of the same length, and throttles attempts', async () => {
    process.env.ADMIN_SECRET = 'correct-secret'
    const headers = { 'x-admin-secret': 'wrong!-secret!', 'x-forwarded-for': '192.0.2.1' }
    const body = { workspaceId: TEST_WS_ID, planTier: 'growth' }
    for (let i = 0; i < 10; i++) {
      expect((await call(grantTrialHandler, { method: 'POST', headers, body }))._status).toBe(401)
    }
    expect((await call(grantTrialHandler, { method: 'POST', headers, body }))._status).toBe(429)
  })

  it('rejects free as a trial tier', async () => {
    process.env.ADMIN_SECRET = 'correct-secret'
    const res = await call(grantTrialHandler, {
      method: 'POST', headers: { 'x-admin-secret': 'correct-secret' }, body: { workspaceId: TEST_WS_ID, planTier: 'free' },
    })
    expect(res._status).toBe(400)
  })
})
