#!/usr/bin/env node
// Applies pending SQL migrations from ./drizzle to DATABASE_URL.
//
//   npm run db:migrate              apply now (local / manual use)
//   node scripts/migrate.mjs --deploy
//                                   called by `vercel-build`; only migrates on
//                                   production deploys (and on preview deploys
//                                   when MIGRATE_PREVIEW_DATABASE=true)
//
// Why not `drizzle-kit migrate`? It connects over a websocket/TCP driver. This
// uses Neon's HTTP endpoint (same driver as the app) and applies each
// migration as ONE atomic HTTP transaction: lock → guard → statements →
// bookkeeping row. If any statement fails, nothing from that migration sticks
// and the build fails, so Vercel keeps serving the previous deployment.
//
// Bookkeeping uses drizzle's own table (drizzle.__drizzle_migrations, same
// columns and the same hash/created_at semantics), so drizzle-kit and this
// script agree on what has been applied.
//
// Databases created with `drizzle-kit push` (before migrations existed) have no
// bookkeeping rows. On first run the script "adopts" them: it checks that every
// table and column of the baseline migration exists, records the baseline as
// applied without running it, then applies the later migrations normally.
// Those later migrations must be idempotent if push may already have applied
// them (see drizzle/0001_phase0_usage_tables.sql).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { readMigrationFiles } from 'drizzle-orm/migrator'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_FOLDER = path.join(ROOT, 'drizzle')
const TABLE = 'drizzle.__drizzle_migrations'
const ALREADY_APPLIED = 'stratmap-migrate: already applied'
// Serialises concurrent deploys. Transaction-scoped, so it works over HTTP.
const LOCK = `SELECT pg_advisory_xact_lock(hashtext('stratmap-migrations'))`

const log = (msg) => console.log(`[migrate] ${msg}`)

function shouldRun() {
  if (!process.argv.includes('--deploy')) return true
  const env = process.env.VERCEL_ENV
  if (env === 'production') return true
  if (env === 'preview') {
    if (process.env.MIGRATE_PREVIEW_DATABASE === 'true') return true
    log('preview deploy: skipping (set MIGRATE_PREVIEW_DATABASE=true once Preview has its own database)')
    return false
  }
  log(`VERCEL_ENV=${env ?? 'unset'}: skipping (deploy migrations run on production only)`)
  return false
}

/** Tables → columns declared by a migration snapshot (drizzle/meta/NNNN_snapshot.json). */
function snapshotColumns(idx) {
  const file = path.join(MIGRATIONS_FOLDER, 'meta', `${String(idx).padStart(4, '0')}_snapshot.json`)
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'))
  return Object.values(snapshot.tables).map((t) => ({
    table: t.name,
    schema: t.schema || 'public',
    columns: Object.keys(t.columns),
  }))
}

/** Returns "table.column" strings the snapshot declares but the database lacks. */
async function missingObjects(sql, idx) {
  const rows = await sql`
    SELECT table_schema, table_name, column_name FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`
  const have = new Set(rows.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`))
  const missing = []
  for (const t of snapshotColumns(idx)) {
    for (const c of t.columns) {
      if (!have.has(`${t.schema}.${t.table}.${c}`)) missing.push(`${t.table}.${c}`)
    }
  }
  return missing
}

/** Runs `statements` + the bookkeeping insert atomically, unless another deploy got there first. */
async function applyAtomically(sql, migration, statements) {
  const guard = `DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM ${TABLE} WHERE created_at >= ${Number(migration.folderMillis)}) THEN
      RAISE EXCEPTION '${ALREADY_APPLIED}';
    END IF;
  END $$`
  try {
    await sql.transaction([
      sql.query(LOCK),
      sql.query(guard),
      ...statements.map((s) => sql.query(s)),
      sql.query(`INSERT INTO ${TABLE} (hash, created_at) VALUES ($1, $2)`, [migration.hash, migration.folderMillis]),
    ])
    return true
  } catch (err) {
    if (String(err?.message).includes(ALREADY_APPLIED)) return false
    throw err
  }
}

async function main() {
  if (!shouldRun()) return

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  const sql = neon(url)
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER })
  const tags = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'))
    .entries.map((e) => e.tag)

  await sql.query('CREATE SCHEMA IF NOT EXISTS drizzle')
  await sql.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`)

  let [last] = await sql.query(`SELECT created_at FROM ${TABLE} ORDER BY created_at DESC LIMIT 1`)

  // Adopt a push-managed database: it has tables but no bookkeeping.
  if (!last) {
    const [{ exists }] = await sql`SELECT to_regclass('public.workspaces') IS NOT NULL AS exists`
    if (exists) {
      const missing = await missingObjects(sql, 0)
      if (missing.length) {
        throw new Error(
          `Database has tables but no migration history, and does not match the baseline (${tags[0]}).\n` +
          `Missing: ${missing.join(', ')}\n` +
          'Bring it to the baseline schema first, then redeploy.',
        )
      }
      if (await applyAtomically(sql, migrations[0], [])) log(`adopted existing database at baseline ${tags[0]}`)
      ;[last] = await sql.query(`SELECT created_at FROM ${TABLE} ORDER BY created_at DESC LIMIT 1`)
    }
  }

  const lastMillis = last ? Number(last.created_at) : -1
  const pending = migrations
    .map((m, i) => ({ ...m, tag: tags[i] }))
    .filter((m) => m.folderMillis > lastMillis)

  if (!pending.length) log('schema is up to date')
  for (const m of pending) {
    const statements = m.sql.map((s) => s.trim()).filter(Boolean)
    if (await applyAtomically(sql, m, statements)) log(`applied ${m.tag} (${statements.length} statements)`)
    else log(`${m.tag} was applied by a concurrent run, skipping`)
  }

  // Final safety net: the database must now contain everything the latest snapshot declares.
  const missing = await missingObjects(sql, migrations.length - 1)
  if (missing.length) throw new Error(`Schema verification failed after migrating. Missing: ${missing.join(', ')}`)
  log(`verified against ${tags[tags.length - 1]}`)
}

main().catch((err) => {
  console.error(`[migrate] FAILED: ${err?.message ?? err}`)
  process.exit(1)
})
