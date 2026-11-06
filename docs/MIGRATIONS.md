# Database migrations

Schema changes are versioned SQL files in `drizzle/`. Production deploys apply them
automatically. **Do not run `drizzle-kit push` against production.**

## Changing the schema

1. Edit `src/lib/db/schema.ts`.
2. Run `npm run db:generate`. This writes `drizzle/NNNN_<name>.sql` plus a snapshot in `drizzle/meta/`.
3. Read the generated SQL, then commit it together with the schema change.
4. Run `npm run test:api`. The test schema is built from these migrations, and
   `api/__tests__/migrations.test.ts` fails if `schema.ts` and `drizzle/` disagree.
5. Merge to `main`. The production deploy applies the migration.

To apply migrations to a dev database by hand, run `DATABASE_URL=… npm run db:migrate`.

## What happens on deploy

`vercel.json` sets the build command to `npm run vercel-build`, which runs:

```
npm run build  &&  node scripts/migrate.mjs --deploy
```

- **Build first, then migrate.** A broken build never touches the database. A failed
  migration fails the deploy, and Vercel keeps serving the previous version.
- **Atomic per migration.** Each file runs as one Neon HTTP transaction, together with
  its row in `drizzle.__drizzle_migrations`. That's the same table drizzle-kit uses.
- **Safe under concurrent deploys.** An advisory lock plus an "already applied" guard
  mean that two builds can't apply the same migration twice.
- **Verified.** After migrating, the script checks that every table and column in the
  latest snapshot exists. If any is missing, the deploy fails.
- **Environments.** The script runs on `VERCEL_ENV=production`. On `preview` it is
  skipped unless `MIGRATE_PREVIEW_DATABASE=true`. Set that only once Preview has its own
  Neon branch (roadmap 3.8), otherwise preview builds of unmerged branches would migrate
  the shared database.

### Existing databases created with `push`

The first time the script sees a database that has tables but no migration history, it
**adopts** it:

1. It checks that every table and column in `0000_baseline` exists.
2. It then checks each later migration in turn (`scripts/adopt.mjs`). A migration counts as
   already applied when every table, column and index in its snapshot exists. `push` builds
   the current `schema.ts`, so such a database is normally at the latest migration.
3. It records those migrations as applied, without running them, and applies the rest.

If the baseline check fails, the deploy stops and lists what is missing. If an index is
missing but its columns exist, that migration runs again and fails (atomically, nothing
changes) rather than guessing; fix the database by hand and redeploy.

Before the first production deploy, look at the target database read-only (or on a Neon
branch copy) to see which migrations it would adopt. Tests: `api/__tests__/migrate-adopt.test.ts`.

## Rules for writing migrations

- **Expand, then contract.** Migrations run *before* the new code is live, while the old
  code is still serving traffic. Add columns as nullable or with a default. Drop or rename
  only in a later deploy, once no running code uses the old shape.
- **Never edit a migration that has been applied anywhere.** The hash is recorded. Add a
  new migration instead.
- **No `CREATE INDEX CONCURRENTLY`**, because it can't run inside a transaction. This is
  fine at current table sizes. Revisit when a table reaches millions of rows.
- **Enum changes:** `ALTER TYPE … ADD VALUE` works in a transaction on Postgres 17, but the
  new value can't be used in the same migration.

## Live verification

`npm run test:live` runs the Phase 0 security checks through the real API handlers
against `DATABASE_URL`. Use a Neon **dev branch**, never production. Every row is created
in a throwaway workspace and deleted at the end.
