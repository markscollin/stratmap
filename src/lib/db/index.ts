/// <reference types="node" />
import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// This module is server-side only (Vercel API routes, Phase 2).
// Never import this in frontend components.
// Test tooling only: scripts/neon-http-emulator.mjs lets the e2e suite run without a Neon account. It is never
// used on a production deploy, even if the variable were set by mistake.
if (process.env.NEON_HTTP_ENDPOINT && process.env.VERCEL_ENV !== 'production') {
  neonConfig.fetchEndpoint = process.env.NEON_HTTP_ENDPOINT
}

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
