// R-73: a foreign key without an index makes every cascade or SET NULL on the parent scan the whole child table.
// Checked against the real migrated schema: every foreign-key column must lead some index (or the primary key).
import { describe, it, expect, beforeAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { setupSchema, testDb } from './helpers/db'

beforeAll(async () => { await setupSchema() })

describe('foreign keys are indexed (R-73)', () => {
  it('every single-column foreign key is the first column of an index', async () => {
    const rows = await testDb.execute(sql`
      SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
        )
      ORDER BY 1, 2`)
    const missing = (rows as unknown as { rows: { tbl: string; col: string }[] }).rows.map(r => `${r.tbl}.${r.col}`)
    expect(missing).toEqual([])
  })
})
