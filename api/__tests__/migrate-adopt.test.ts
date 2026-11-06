// A database built by `drizzle-kit push` has tables but no migration history.
// scripts/adopt.mjs decides which migrations it already contains, so the deploy
// doesn't re-run ones that would fail with "already exists".
import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { fileURLToPath } from 'node:url'
// @ts-expect-error plain .mjs script, no types
import { adoptionPoint } from '../../scripts/adopt.mjs'

const FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))
const migrations = readMigrationFiles({ migrationsFolder: FOLDER })

async function dbAt(upTo: number) {
  const db = new PGlite()
  for (const m of migrations.slice(0, upTo + 1)) for (const s of m.sql) if (s.trim()) await db.exec(s)
  const query = async (text: string) => (await db.query(text)).rows as Record<string, string>[]
  return { db, query }
}

describe('adopting a push-managed database', () => {
  it('has five migrations to reason about', () => expect(migrations.length).toBeGreaterThanOrEqual(5))

  it('a database already at the latest schema needs nothing run', async () => {
    const { query } = await dbAt(migrations.length - 1)
    expect(await adoptionPoint(query, FOLDER, migrations.length)).toEqual({ baselineMissing: [], level: migrations.length - 1 })
  })

  it('a database built before later migrations only gets the missing ones', async () => {
    for (const at of [0, 1, 2, 3]) {
      const { query } = await dbAt(at)
      const { level } = await adoptionPoint(query, FOLDER, migrations.length)
      expect(level).toBe(at)
    }
  })

  it('a missing index stops adoption there, so that migration runs', async () => {
    const { db, query } = await dbAt(migrations.length - 1)
    await db.exec('DROP INDEX "pending_invites_token_hash_idx"')
    const { level } = await adoptionPoint(query, FOLDER, migrations.length)
    expect(level).toBe(2) // 0003 added the index; it must run again (and fails loudly, atomically, if columns exist)
  })

  it('refuses a database that does not match the baseline', async () => {
    const { db, query } = await dbAt(0)
    await db.exec('ALTER TABLE "nodes" DROP COLUMN "title"')
    const res = await adoptionPoint(query, FOLDER, migrations.length)
    expect(res.level).toBe(-1)
    expect(res.baselineMissing).toContain('nodes.title')
  })
})
