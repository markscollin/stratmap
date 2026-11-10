import { neon, neonConfig } from '@neondatabase/serverless'

// The e2e helpers talk to the database directly (a plan change, the end-of-run cleanup). When the suite runs against
// the local emulator (scripts/neon-http-emulator.mjs, NEON_HTTP_ENDPOINT set) they must go to the same place as the app.
export function e2eSql(url: string) {
  if (process.env.NEON_HTTP_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_HTTP_ENDPOINT
  return neon(url)
}
