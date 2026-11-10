// The e2e suite runs against scripts/neon-http-emulator.mjs (PGlite behind Neon's HTTP protocol) so it needs no
// Neon account or secret. These tests drive it with the REAL @neondatabase/serverless client and the app's own
// Drizzle schema, so any difference from how the app talks to Neon shows up here.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
// @ts-expect-error plain .mjs script, no types
import { startEmulator } from '../../scripts/neon-http-emulator.mjs'
import * as schema from '../../src/lib/db/schema'

let emulator: { url: string; close: () => Promise<void> }
const URL_LABEL = 'postgres://e2e:e2e@127.0.0.1/e2e'
const sql = () => { neonConfig.fetchEndpoint = emulator.url; return neon(URL_LABEL) }

beforeAll(async () => { emulator = await startEmulator({ port: 0, quiet: true }) })
afterAll(async () => { await emulator.close() })

describe('Neon HTTP emulator', () => {
  it('answers a query, and a health check', async () => {
    expect(await sql()`select 1 as ok`).toEqual([{ ok: 1 }])
    expect((await fetch(emulator.url.replace('/sql', '/health'))).status).toBe(200)
  })

  it('round-trips the types the app uses exactly as Postgres would', async () => {
    const q = sql()
    await q`create temp table t (id text, n int, big bigint, r real, d numeric, ok boolean, tags text[], j jsonb, ts timestamp, tz timestamptz, nul text)`
    const when = new Date('2026-11-07T15:11:48.123Z')
    await q`insert into t values (${'a'}, ${42}, ${'9007199254740993'}, ${1.5}, ${'12.50'}, ${true}, ${['x', 'y z', 'q"uote']}, ${JSON.stringify({ a: [1, 2], b: 'c' })}, ${when.toISOString()}, ${when.toISOString()}, ${null})`
    const [row] = await q`select * from t`
    expect(row).toMatchObject({ id: 'a', n: 42, big: '9007199254740993', r: 1.5, d: '12.50', ok: true, tags: ['x', 'y z', 'q"uote'], j: { a: [1, 2], b: 'c' }, nul: null })
    expect(row.tz).toEqual(when)
    expect(row.ts).toBeInstanceOf(Date)
  })

  it('returns an empty array for no rows, and a row count for writes (full results)', async () => {
    const q = sql()
    await q`create temp table e (id int)`
    expect(await q`select * from e`).toEqual([])
    const res = await q.query('insert into e values ($1), ($2)', [1, 2], { fullResults: true })
    expect(res).toMatchObject({ command: 'INSERT', rowCount: 2 })
    expect(await q.query('update e set id = id + 1 where id = $1 returning id', [1])).toEqual([{ id: 2 }])
  })

  it('runs a batch as ONE transaction: all or nothing', async () => {
    const q = sql()
    await q`create table batch_t (id int primary key)`
    await expect(q.transaction([q`insert into batch_t values (1)`, q`insert into batch_t values (1)`])).rejects.toMatchObject({ code: '23505' })
    expect(await q`select count(*)::int as n from batch_t`).toEqual([{ n: 0 }])      // the first insert was rolled back too
    const results = await q.transaction([q`insert into batch_t values (7)`, q`select id from batch_t`])
    expect(results[1]).toEqual([{ id: 7 }])
  })

  it('reports a Postgres error the way Neon does (message and code), and keeps serving afterwards', async () => {
    const q = sql()
    await expect(q`select * from no_such_table`).rejects.toMatchObject({ code: '42P01', message: expect.stringContaining('no_such_table') })
    expect(await q`select 2 as ok`).toEqual([{ ok: 2 }])
  })

  it('interleaved requests never mix up their transactions', async () => {
    const q = sql()
    await q`create table race_t (id int primary key, v int)`
    await q`insert into race_t values (1, 0)`
    const bump = () => q.transaction([q`select v from race_t where id = 1`, q`update race_t set v = v + 1 where id = 1`])
    await Promise.all(Array.from({ length: 12 }, bump))
    expect(await q`select v from race_t where id = 1`).toEqual([{ v: 12 }])
  })

  it('has the real schema applied, and the app\'s Drizzle code works against it', async () => {
    neonConfig.fetchEndpoint = emulator.url
    const db = drizzle(neon(URL_LABEL), { schema })
    const id = crypto.randomUUID()
    await db.insert(schema.workspaces).values({ id, name: 'Emu', ownerId: 'u-1', ownerRole: 'CEO', size: '1-10' })
    await db.insert(schema.auditLog).values({ id: crypto.randomUUID(), workspaceId: id, actorUserId: 'u-1', action: 'x', targetType: 'workspace', details: { a: 1, ok: true } })
    await db.insert(schema.roleComments).values({ id: crypto.randomUUID(), workspaceId: id, chartId: 'none', nodeId: 'none', authorId: 'u', body: 'x', mentions: ['a', 'b'] }).catch(() => {})   // FK violation is expected
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id))
    expect(ws).toMatchObject({ name: 'Emu', planTier: 'free', cancelAtPeriodEnd: false })
    expect(ws.createdAt).toBeInstanceOf(Date)
    const [event] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.workspaceId, id))
    expect(event.details).toEqual({ a: 1, ok: true })
    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, id))      // cascades
    expect(await db.select().from(schema.auditLog).where(eq(schema.auditLog.workspaceId, id))).toEqual([])
  })
})
