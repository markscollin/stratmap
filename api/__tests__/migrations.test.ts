// Guards the migration workflow (roadmap 3.2):
//  1. schema.ts must not change without a generated migration (`npm run db:generate`).
//  2. Applying ./drizzle migrations must produce exactly the schema in schema.ts.
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import * as schema from '../../src/lib/db/schema'
import { setupSchema, testDb } from './helpers/db'

interface Snapshot {
  tables: Record<string, { name: string; columns: Record<string, { name: string; notNull: boolean }>; indexes: Record<string, unknown> }>
  enums: Record<string, { name: string; values: string[] }>
}

const META = fileURLToPath(new URL('../../drizzle/meta', import.meta.url))

function latestSnapshot() {
  const journal = JSON.parse(fs.readFileSync(`${META}/_journal.json`, 'utf8'))
  const last = journal.entries[journal.entries.length - 1]
  return JSON.parse(fs.readFileSync(`${META}/${String(last.idx).padStart(4, '0')}_snapshot.json`, 'utf8'))
}

beforeAll(async () => { await setupSchema() })

describe('database migrations', () => {
  it('schema.ts has no changes missing from ./drizzle (run `npm run db:generate`)', async () => {
    const prev = latestSnapshot()
    const cur = generateDrizzleJson(schema, prev.id)
    const pending = await generateMigration(prev, cur)
    expect(pending).toEqual([])
  })

  it('the migrated database matches schema.ts (tables, columns, nullability, indexes, enums)', async () => {
    const expected = generateDrizzleJson(schema) as unknown as Snapshot
    const want = {
      columns: Object.values(expected.tables).flatMap(t =>
        Object.values(t.columns).map(c => `${t.name}.${c.name} ${c.notNull ? 'NOT NULL' : 'NULL'}`)).sort(),
      indexes: Object.values(expected.tables).flatMap(t => Object.keys(t.indexes)).sort(),
      enums: Object.values(expected.enums).map(e => `${e.name}(${e.values.join(',')})`).sort(),
    }

    const cols = await testDb.execute<{ t: string; c: string; nullable: string }>(sql`
      SELECT table_name AS t, column_name AS c, is_nullable AS nullable
      FROM information_schema.columns WHERE table_schema = 'public'`)
    const idx = await testDb.execute<{ name: string }>(sql`
      SELECT indexname AS name FROM pg_indexes
      WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey' AND indexname NOT LIKE '%_pk'`)
    const enums = await testDb.execute<{ name: string; vals: string }>(sql`
      SELECT t.typname AS name, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS vals
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname`)

    expect({
      columns: cols.rows.map(r => `${r.t}.${r.c} ${r.nullable === 'NO' ? 'NOT NULL' : 'NULL'}`).sort(),
      indexes: idx.rows.map(r => r.name).sort(),
      enums: enums.rows.map(r => `${r.name}(${r.vals})`).sort(),
    }).toEqual(want)
  })
})
