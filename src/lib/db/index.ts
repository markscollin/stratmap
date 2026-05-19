import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// This module is server-side only (Vercel API routes, Phase 2).
// Never import this in frontend components.
const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
