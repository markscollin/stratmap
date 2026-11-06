// Works out how far a push-managed database (tables, but no migration history) has
// already got through ./drizzle. Pure read-only; used by scripts/migrate.mjs and its test.
//
// Each drizzle snapshot (drizzle/meta/NNNN_snapshot.json) is the whole schema after
// migration NNNN. A database "is at" migration N when every table, column and index
// of snapshot N exists. `drizzle-kit push` builds the schema from schema.ts, so such a
// database is usually at the latest migration already. Re-running non-idempotent
// migrations (ADD COLUMN, CREATE INDEX) on it would fail with "already exists".
import fs from 'node:fs'
import path from 'node:path'

function readSnapshot(folder, idx) {
  const file = path.join(folder, 'meta', `${String(idx).padStart(4, '0')}_snapshot.json`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/** "table.column" / "index:name" strings the snapshot declares but the database lacks. */
export async function missingObjects(query, folder, idx) {
  const cols = await query(`
    SELECT table_schema, table_name, column_name FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`)
  const idxs = await query(`SELECT schemaname, indexname FROM pg_indexes`)
  const haveCol = new Set(cols.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`))
  const haveIdx = new Set(idxs.map((r) => `${r.schemaname}.${r.indexname}`))
  const missing = []
  for (const t of Object.values(readSnapshot(folder, idx).tables)) {
    const schema = t.schema || 'public'
    for (const c of Object.keys(t.columns)) {
      if (!haveCol.has(`${schema}.${t.name}.${c}`)) missing.push(`${t.name}.${c}`)
    }
    for (const i of Object.keys(t.indexes ?? {})) {
      if (!haveIdx.has(`${schema}.${i}`)) missing.push(`index:${i}`)
    }
  }
  return missing
}

/**
 * Returns { baselineMissing, level }. `level` is the highest migration index the
 * database already satisfies, counting up from the baseline without gaps (-1 if the
 * baseline itself is not met, in which case `baselineMissing` says why).
 */
export async function adoptionPoint(query, folder, migrationCount) {
  const baselineMissing = await missingObjects(query, folder, 0)
  if (baselineMissing.length) return { baselineMissing, level: -1 }
  let level = 0
  while (level + 1 < migrationCount && (await missingObjects(query, folder, level + 1)).length === 0) level++
  return { baselineMissing, level }
}
