// R-33: a person has at most one membership per workspace, and the migration that adds the rule keeps the best of any duplicates.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { setupSchema, cleanDb, seedWorkspace, testDb, TEST_WS_ID, TEST_USER_ID } from './helpers/db'
import * as schema from '../../src/lib/db/schema'

beforeAll(async () => { await setupSchema() })
beforeEach(async () => { await cleanDb(); await seedWorkspace() })

describe('workspace_members uniqueness', () => {
  it('refuses a second membership for the same person in the same workspace', async () => {
    await expect(testDb.insert(schema.workspaceMembers).values({
      id: 'wm-twice', workspaceId: TEST_WS_ID, userId: TEST_USER_ID, email: 'x@example.com', permission: 'viewer',
    })).rejects.toThrow()
  })

  it('still allows the same person in a different workspace', async () => {
    await testDb.insert(schema.workspaces).values({ id: 'ws-other', name: 'Other', ownerId: 'someone', ownerRole: 'x', size: '1-10', planTier: 'free' })
    await testDb.insert(schema.workspaceMembers).values({ id: 'wm-other', workspaceId: 'ws-other', userId: TEST_USER_ID, email: 'x@example.com', permission: 'viewer' })
    const rows = await testDb.select().from(schema.workspaceMembers)
    expect(rows.filter(r => r.userId === TEST_USER_ID)).toHaveLength(2)
  })

  it('the migration removes existing duplicates keeping the highest role, then the earliest, then the lowest id', async () => {
    const dir = new URL('../../drizzle/', import.meta.url)
    const file = readdirSync(dir).find(f => f.startsWith('0015_'))!
    const sqlText = readFileSync(new URL(file, dir), 'utf8')
    const db = new PGlite()
    await db.exec(`CREATE TYPE permission AS ENUM ('owner','admin','editor','commenter','viewer');
      CREATE TABLE workspace_members (id text PRIMARY KEY, workspace_id text NOT NULL, user_id text NOT NULL, permission permission NOT NULL, joined_at timestamp NOT NULL);`)
    await db.exec(`INSERT INTO workspace_members VALUES
      ('a1','w','u','viewer','2026-01-01'), ('a2','w','u','admin','2026-02-01'), ('a3','w','u','admin','2026-01-15'),
      ('b1','w','v','editor','2026-01-01'), ('b2','w','v','editor','2026-01-01'),
      ('c1','w','x','viewer','2026-01-01'), ('c2','other','x','viewer','2026-01-01');`)
    for (const stmt of sqlText.split('--> statement-breakpoint')) await db.exec(stmt)
    const kept = (await db.query<{ id: string }>('SELECT id FROM workspace_members ORDER BY id')).rows.map(r => r.id)
    expect(kept).toEqual(['a3', 'b1', 'c1', 'c2']) // a3: admin and earlier than a2; b1: lowest id; c1/c2 are different workspaces
    await expect(db.exec(`INSERT INTO workspace_members VALUES ('a9','w','u','viewer','2026-03-01')`)).rejects.toThrow()
  })
})
