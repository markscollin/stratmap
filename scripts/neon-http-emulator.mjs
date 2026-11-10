#!/usr/bin/env node
// A local stand-in for Neon's HTTP SQL endpoint, backed by PGlite (in-process Postgres).
//
// Why it exists: the app, the migrate script and the e2e helpers all talk to Postgres through
// `@neondatabase/serverless`'s HTTP driver (`neon(url)`). Pointing that driver at this server instead of
// Neon lets the e2e suite run with NO database account, NO shared database and NO secret: CI starts it,
// the suite runs against a throwaway in-memory Postgres, and nothing outside the job is touched.
//
//   node scripts/neon-http-emulator.mjs [--port 4444] [--dir ./some/folder] [--no-migrate]
//
// then, in the shell that runs the app / tests:
//   NEON_HTTP_ENDPOINT=http://127.0.0.1:4444/sql
//   E2E_DATABASE_URL=postgres://e2e:e2e@127.0.0.1/e2e        (any well-formed URL: it is only a label here)
//
// What it speaks (checked against the installed driver, see node_modules/@neondatabase/serverless):
//   POST /sql   { query, params }            -> { command, rowCount, fields, rows }   rows are arrays of TEXT values
//   POST /sql   { queries: [{query, params}] } -> { results: [ ...one per query ] }   run in ONE transaction
//   errors      HTTP 400 { message, severity, code, detail, ... }  (the driver turns this into a NeonDbError)
//   GET  /health -> 200 "ok"
//
// Values are returned as raw Postgres text (the driver sends `Neon-Raw-Text-Output: true` and parses them itself),
// so a timestamp or an array round-trips exactly as it would against real Neon.
//
// This is a test tool. It is not a database server: one connection, requests run one at a time, nothing is
// authenticated, and it listens on 127.0.0.1 only. Never point production at it.

import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// The driver sends every parameter as text and parses every result itself, so the emulator must neither convert
// parameters into JS types nor convert results out of text. PGlite converts by default (booleans, JSON, dates, arrays…),
// so after the schema is built every entry of its type tables is replaced with a pass-through.
const passThrough = (table) => Object.fromEntries(Object.keys(table).map((oid) => [oid, (value) => value]))

// Fields of a Postgres error the driver copies onto its NeonDbError (so callers can read `.code`, `.detail`…).
const ERROR_FIELDS = ['severity', 'code', 'detail', 'hint', 'position', 'internalPosition', 'internalQuery', 'where',
  'schema', 'table', 'column', 'dataType', 'constraint', 'file', 'line', 'routine']

const commandOf = (query) => (/^\s*(?:\/\*[\s\S]*?\*\/\s*)*(\w+)/.exec(query)?.[1] ?? '').toUpperCase()

async function runOne(db, { query, params }) {
  const result = await db.query(query, params ?? [], { rowMode: 'array' })
  return {
    command: commandOf(query),
    rowCount: result.affectedRows ?? result.rows.length,
    fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rows: result.rows,
    rowAsArray: true,
  }
}

/**
 * Starts the emulator. Resolves to { url, port, close }.
 * `migrate` (default true) applies ./drizzle to the empty database first, so it is ready to serve the app.
 */
export async function startEmulator({ port = 4444, dataDir, migrations = true, quiet = false } = {}) {
  const pg = new PGlite(dataDir)
  await pg.waitReady
  if (migrations) await migrate(drizzle(pg), { migrationsFolder: path.join(ROOT, 'drizzle') })
  pg.parsers = passThrough(pg.parsers)
  pg.serializers = passThrough(pg.serializers)

  // PGlite has one connection: a transaction must not be interleaved with another request.
  let queue = Promise.resolve()
  const exclusive = (job) => {
    const run = queue.then(job, job)
    queue = run.catch(() => {})
    return run
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') { res.writeHead(200); res.end('ok'); return }
    if (req.method !== 'POST' || !req.url?.startsWith('/sql')) { res.writeHead(404); res.end('not found'); return }

    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', async () => {
      const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
      let payload
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return send(400, { message: 'invalid JSON body' }) }

      try {
        const out = await exclusive(async () => {
          if (Array.isArray(payload.queries)) {
            // A batch is one atomic transaction (the migrate script relies on this).
            return { results: await pg.transaction(async (tx) => {
              const results = []
              for (const q of payload.queries) results.push(await runOne(tx, q))
              return results
            }) }
          }
          return runOne(pg, payload)
        })
        send(200, out)
      } catch (err) {
        const body = { message: err?.message ?? String(err) }
        for (const f of ERROR_FIELDS) if (err?.[f] !== undefined) body[f] = err[f]
        if (!quiet) console.error(`[neon-emulator] ${body.code ?? 'error'}: ${body.message}`)
        send(400, body)
      }
    })
  })

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  const actual = server.address().port
  return {
    port: actual,
    url: `http://127.0.0.1:${actual}/sql`,
    close: async () => { await new Promise((resolve) => server.close(resolve)); await pg.close() },
  }
}

// ── command line ────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback }
  const emulator = await startEmulator({
    port: Number(arg('--port', process.env.NEON_EMULATOR_PORT ?? 4444)),
    dataDir: arg('--dir'),
    migrations: !process.argv.includes('--no-migrate'),
  })
  console.log(`[neon-emulator] ready: set NEON_HTTP_ENDPOINT=${emulator.url}`)
  const stop = async () => { await emulator.close(); process.exit(0) }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
