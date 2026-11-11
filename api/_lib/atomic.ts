import { db } from './db'

// Runs several statements as ONE atomic unit, whichever Drizzle driver is in use:
//  - Neon's HTTP driver has no `transaction`, but `batch` sends the statements as a single transaction;
//  - PGlite (the API tests) has `transaction` but no `batch`.
// `build` receives the executor and returns the statements WITHOUT awaiting them (Drizzle query builders), e.g.
//   await runAtomically(d => [d.delete(a).where(...), d.insert(b).values(rows)])
// It must return at least one statement. Either everything is applied or nothing is.
type Statement = PromiseLike<unknown>
type Executor = typeof db

export async function runAtomically(build: (d: Executor) => Statement[]): Promise<void> {
  const anyDb = db as unknown as {
    batch?: (statements: Statement[]) => Promise<unknown>
    transaction: (fn: (tx: Executor) => Promise<void>) => Promise<void>
  }
  if (typeof anyDb.batch === 'function') {
    const statements = build(db)
    if (statements.length === 0) return
    await anyDb.batch(statements)
    return
  }
  await anyDb.transaction(async (tx) => {
    for (const statement of build(tx)) await statement
  })
}
