/// <reference types="node" />

// Resolve the app's base URL for building absolute links (checkout redirects,
// invite links, email templates). Prefers an explicit APP_URL, then the Vercel
// deployment URL, falling back to localhost for local dev.
export function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
