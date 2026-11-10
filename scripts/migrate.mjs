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
// bookkeeping rows. On first run the script "adopts" them (scripts/adopt.mjs): it
// checks the baseline schema exists, then records the baseline AND every later
// migration whose tables, columns and indexes are already present as applied
// without running them, and applies only the rest.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon, neonConfig } from '@neondatabase/serverless'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { adoptionPoint, missingObjects } from './adopt.mjs'

// Test tooling only (see scripts/neon-http-emulator.mjs); never on a production deploy.
if (process.env.NEON_HTTP_ENDPOINT && process.env.VERCEL_ENV !== 'production') neonConfig.fetchEndpoint = process.env.NEON_HTTP_ENDPOINT

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

  // Adopt a push-managed database: it has tables but no bookkeeping. Record every
  // migration whose schema it already contains, so only the genuinely new ones run.
  if (!last) {
    const [{ exists }] = await sql`SELECT to_regclass('public.workspaces') IS NOT NULL AS exists`
    if (exists) {
      const { baselineMissing, level } = await adoptionPoint((q) => sql.query(q), MIGRATIONS_FOLDER, migrations.length)
      if (baselineMissing.length) {
        throw new Error(
          `Database has tables but no migration history, and does not match the baseline (${tags[0]}).\n` +
          `Missing: ${baselineMissing.join(', ')}\n` +
          'Bring it to the baseline schema first, then redeploy.',
        )
      }
      for (let i = 0; i <= level; i++) await applyAtomically(sql, migrations[i], [])
      log(`adopted existing database: recorded ${tags.slice(0, level + 1).join(', ')} as already applied`)
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
  const missing = await missingObjects((q) => sql.query(q), MIGRATIONS_FOLDER, migrations.length - 1)
  if (missing.length) throw new Error(`Schema verification failed after migrating. Missing: ${missing.join(', ')}`)
  log(`verified against ${tags[tags.length - 1]}`)
}

main().catch((err) => {
  console.error(`[migrate] FAILED: ${err?.message ?? err}`)
  process.exit(1)
})
