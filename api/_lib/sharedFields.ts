import { nodes } from '../../src/lib/db/schema'

// What a public share link may show about a role (R-26, owner decision D-5). This is an ALLOW-list: a column added to `nodes`
// later (an email, a note, a salary) is not published until someone writes it here on purpose. Everything the read-only canvas
// draws is listed; `location`, `startDate` and `avatarUrl` are public by decision D-5. api/__tests__/share-fields.test.ts fails
// when a `nodes` column is in neither list.
export const SHARED_NODE_FIELDS = [
  'id', 'name', 'title', 'departmentId', 'managerId', 'status', 'employmentType', 'roleType',
  'avatarUrl', 'location', 'startDate', 'x', 'y', 'isNew',
] as const satisfies readonly (keyof typeof nodes.$inferSelect)[]

/** Columns that exist on `nodes` and are deliberately never in a share response. */
export const PRIVATE_NODE_FIELDS = ['chartId'] as const satisfies readonly (keyof typeof nodes.$inferSelect)[]

type Row = typeof nodes.$inferSelect
export type PublicNode = Pick<Row, (typeof SHARED_NODE_FIELDS)[number]>

export function publicNode(row: Row): PublicNode {
  const out: Record<string, unknown> = {}
  for (const f of SHARED_NODE_FIELDS) out[f] = row[f]
  // A photo on a public share or embed page is loaded by every visitor's browser, so an address someone typed could log those
  // visitors' IPs (R-75). Only photos from the sign-in provider's image hosts are shown publicly; anything else shows initials.
  if (!isPublicAvatar(row.avatarUrl)) out.avatarUrl = null
  return out as PublicNode
}

/** Image hosts a public page may load a photo from (the sign-in provider's and common account-photo services). */
export const PUBLIC_AVATAR_HOSTS = ['img.clerk.com', 'images.clerk.dev', 'www.gravatar.com', 'secure.gravatar.com', 'lh3.googleusercontent.com', 'avatars.githubusercontent.com']

export function isPublicAvatar(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && PUBLIC_AVATAR_HOSTS.includes(u.hostname)
  } catch { return false }
}
