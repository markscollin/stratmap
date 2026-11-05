// Phase 0 verification against a real Neon database (neon-http driver, the
// same one production uses). Complements api/__tests__/security.test.ts, which
// runs on PGlite: this proves the schema is deployed and the queries work on
// the real driver (upserts, RETURNING, cascades, timestamps).
//
// Run: DATABASE_URL=<dev branch url> npm run test:live
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'

vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))
vi.mock('../_lib/email', () => ({ sendWorkspaceInvite: vi.fn().mockResolvedValue(undefined) }))
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
import { eq, like, sql } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { db } from '../_lib/db'
import * as schema from '../../src/lib/db/schema'
import chartsHandler from '../charts/index'
import chartHandler from '../charts/[id]'
import nodesHandler from '../charts/[id]/nodes'
import jdHandler from '../charts/[id]/jd/[nodeId]'
import shareHandler from '../charts/[id]/share'
import publicShareHandler from '../share/[code]'
import memberHandler from '../workspace/members/[userId]'
import invitesHandler from '../workspace/invites'
import aiDraftHandler from '../ai/draft'
import { hitRateLimit } from '../_lib/rateLimit'
import { createReq } from '../__tests__/helpers/req'
import { createRes, type MockRes } from '../__tests__/helpers/res'

type Role = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'
type Handler = (req: VercelRequest, res: VercelResponse) => unknown

const RUN = `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const WS = `ws-${RUN}`
const CHART = `chart-${RUN}`
const NODE = `node-${RUN}`
const OWNER = `u-owner-${RUN}`
const IP = `203.0.113.${Math.floor(Math.random() * 250) + 1}-${RUN}` // unique rate-limit bucket

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for live tests')
if (process.env.VERCEL_ENV === 'production') throw new Error('Refusing to run live tests against production')

async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}

const users: Record<Role, string> = {
  owner: OWNER, admin: `u-admin-${RUN}`, editor: `u-editor-${RUN}`,
  commenter: `u-commenter-${RUN}`, viewer: `u-viewer-${RUN}`,
}

/** Authenticate as `role`. permission is omitted, so access.ts resolves it from the real DB. */
function actAs(role: Role) {
  vi.mocked(requireAuth).mockResolvedValue({ userId: users[role], workspaceId: WS })
}

async function setTier(tier: 'free' | 'starter' | 'growth') {
  await db.update(schema.workspaces).set({ planTier: tier }).where(eq(schema.workspaces.id, WS))
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values({
    id: WS, name: `Live test ${RUN}`, ownerId: OWNER, ownerRole: 'Founder/CEO', size: '1-10', planTier: 'growth',
  })
  await db.insert(schema.workspaceMembers).values(
    (Object.keys(users) as Role[]).map(role => ({
      id: `wm-${role}-${RUN}`, workspaceId: WS, userId: users[role], email: `${role}@${RUN}.test`, permission: role,
    })),
  )
  await db.insert(schema.charts).values({ id: CHART, workspaceId: WS, name: 'Live', ownerId: OWNER, creatorId: OWNER })
  await db.insert(schema.nodes).values({ id: NODE, chartId: CHART, name: 'A', title: 'CEO', x: 0, y: 0 })
  await db.insert(schema.jobDescriptions).values({
    id: `jd-${RUN}`, nodeId: NODE, chartId: CHART, updatedBy: OWNER,
    salaryBandMin: 100000, salaryBandMax: 150000, salaryCurrency: 'USD',
  })
  process.env.ANTHROPIC_API_KEY = 'sk-live-test-not-used'
})

afterAll(async () => {
  // Workspace delete cascades to members, invites, charts (→ nodes, edges, JDs,
  // share links), templates, headcount and ai_usage. rate_limits has no FK.
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, WS))
  await db.delete(schema.rateLimits).where(like(schema.rateLimits.key, `%${RUN}%`))
  const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.workspaces).where(eq(schema.workspaces.id, WS))
  expect(left.n).toBe(0)
  delete process.env.ANTHROPIC_API_KEY
})

describe('schema is deployed', () => {
  it('Phase 0 tables exist with the expected columns', async () => {
    const rows = await db.execute(sql`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name in ('rate_limits', 'ai_usage')
      order by table_name, column_name`)
    const cols = (rows.rows as { table_name: string; column_name: string }[]).map(r => `${r.table_name}.${r.column_name}`)
    expect(cols).toEqual([
      'ai_usage.count', 'ai_usage.period', 'ai_usage.workspace_id',
      'rate_limits.count', 'rate_limits.key', 'rate_limits.window_id',
    ])
  })
})

describe('roles (resolved from workspace_members in the real DB)', () => {
  it('viewer and commenter cannot write; editor can', async () => {
    for (const role of ['viewer', 'commenter'] as Role[]) {
      actAs(role)
      const res = await call(chartHandler, { method: 'PUT', query: { id: CHART }, body: { name: 'Hacked' } })
      expect(res._status, role).toBe(403)
    }
    actAs('editor')
    expect((await call(chartHandler, { method: 'PUT', query: { id: CHART }, body: { name: 'Renamed' } }))._status).toBe(200)
  })

  it('nobody can grant owner; admin cannot touch another admin', async () => {
    actAs('owner')
    const grant = await call(memberHandler, { method: 'PUT', query: { userId: users.viewer }, body: { permission: 'owner' } })
    expect(grant._status).toBeGreaterThanOrEqual(400)
    actAs('admin')
    const demote = await call(memberHandler, { method: 'PUT', query: { userId: users.admin }, body: { permission: 'viewer' } })
    expect(demote._status).toBe(403)
  })
})

describe('salary redaction', () => {
  it('editor gets no salary fields, admin does', async () => {
    actAs('editor')
    const ed = await call(jdHandler, { method: 'GET', query: { id: CHART, nodeId: NODE } })
    expect(ed._status).toBe(200)
    expect(ed._body).not.toHaveProperty('salaryBandMin')
    actAs('admin')
    const ad = await call(jdHandler, { method: 'GET', query: { id: CHART, nodeId: NODE } })
    expect((ad._body as Record<string, unknown>).salaryBandMin).toBe(100000)
  })
})

describe('plan limits', () => {
  it('free: second chart → 402, and an active trial lifts it', async () => {
    await setTier('free')
    actAs('editor')
    const res = await call(chartsHandler, { method: 'POST', body: { name: 'Second' } })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ error: 'plan-limit', limit: 'charts', max: 1 })

    await db.update(schema.workspaces)
      .set({ trialPlan: 'growth', trialEndsAt: new Date(Date.now() + 86_400_000) })
      .where(eq(schema.workspaces.id, WS))
    expect((await call(chartsHandler, { method: 'POST', body: { name: 'Second' } }))._status).toBe(201)
    await db.update(schema.workspaces).set({ trialPlan: null, trialEndsAt: null }).where(eq(schema.workspaces.id, WS))
  })

  it('free: node limit enforced', async () => {
    await setTier('free')
    actAs('editor')
    await db.insert(schema.nodes).values(
      Array.from({ length: 29 }, (_, i) => ({ id: `fill-${i}-${RUN}`, chartId: CHART, name: 'P', title: 'T', x: 0, y: 0 })),
    )
    const res = await call(nodesHandler, { method: 'POST', query: { id: CHART }, body: { name: 'Too many', title: 'T', x: 0, y: 0 } })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ limit: 'nodes', max: 30 })
  })

  it('free: seats (5 members already) → invite 402', async () => {
    await setTier('free')
    actAs('admin')
    const res = await call(invitesHandler, { method: 'POST', body: { invites: [{ email: `x@${RUN}.test`, permission: 'viewer' }] } })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ limit: 'seats', max: 3 })
  })
})

describe('AI quota (ai_usage upsert on the real driver)', () => {
  it('starter: 3 drafts then 402, counted in ai_usage', async () => {
    await setTier('starter')
    actAs('editor')
    for (let i = 0; i < 3; i++) {
      const res = await call(aiDraftHandler, { method: 'POST', body: { title: 'SE', deptName: 'Eng' } })
      expect(res._written).toContain('RESPONSIBILITIES')
    }
    const over = await call(aiDraftHandler, { method: 'POST', body: { title: 'SE', deptName: 'Eng' } })
    expect(over._status).toBe(402)
    const [usage] = await db.select().from(schema.aiUsage).where(eq(schema.aiUsage.workspaceId, WS))
    expect(usage.count).toBe(3)
  })
})

describe('share links', () => {
  it('16-char code; resolves only while the chart is public', async () => {
    await setTier('growth')
    actAs('editor')
    const created = await call(shareHandler, { method: 'POST', query: { id: CHART } })
    const code = (created._body as { code: string }).code
    expect(code).toMatch(/^[A-Za-z0-9_-]{16}$/)

    const headers = { 'x-forwarded-for': IP }
    expect((await call(publicShareHandler, { method: 'GET', query: { code }, headers }))._status).toBe(404)
    await db.update(schema.charts).set({ isPublic: true }).where(eq(schema.charts.id, CHART))
    const pub = await call(publicShareHandler, { method: 'GET', query: { code }, headers })
    expect(pub._status).toBe(200)
    expect((pub._body as { nodes: Record<string, unknown>[] }).nodes[0]).not.toHaveProperty('chartId')
    await db.update(schema.charts).set({ isPublic: false }).where(eq(schema.charts.id, CHART))
    expect((await call(publicShareHandler, { method: 'GET', query: { code }, headers }))._status).toBe(404)
  })
})

describe('validation', () => {
  it('rejects a bad enum with 400 and ignores a smuggled chartId', async () => {
    actAs('editor')
    await setTier('growth')
    const bad = await call(nodesHandler, { method: 'POST', query: { id: CHART }, body: { name: 'N', title: 'T', x: 0, y: 0, status: 'nope' } })
    expect(bad._status).toBe(400)
    const ok = await call(nodesHandler, { method: 'POST', query: { id: CHART }, body: { name: 'N', title: 'T', x: 0, y: 0, chartId: 'someone-elses' } })
    expect(ok._status).toBe(201)
    expect((ok._body as { chartId: string }).chartId).toBe(CHART)
  })
})

describe('rate limiter (rate_limits upsert on the real driver)', () => {
  it('counts within a window', async () => {
    const key = `probe:${RUN}`
    expect((await hitRateLimit(key, 2, 3600)).allowed).toBe(true)
    expect((await hitRateLimit(key, 2, 3600)).allowed).toBe(true)
    const third = await hitRateLimit(key, 2, 3600)
    expect(third.allowed).toBe(false)
    expect(third.count).toBe(3)
  })
})
