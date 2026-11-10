// Role comments (roadmap 5): the pure parts, so threading and @mentions are covered by tests.

export interface RoleComment {
  id: string
  nodeId: string
  parentId: string | null
  authorId: string
  /** null once the author has left the workspace. */
  authorName: string | null
  /** Empty for a deleted comment (a shell kept so its replies still make sense). */
  body: string
  mentions: string[]
  createdAt: string
  editedAt: string | null
  deleted: boolean
  resolved: boolean
  resolvedBy: string | null
}

export interface Thread { top: RoleComment; replies: RoleComment[] }

/** Top-level comments with their replies, oldest first. Open threads come before resolved ones when `openFirst` is set. */
export function groupThreads(comments: RoleComment[]): Thread[] {
  const byCreated = (a: RoleComment, b: RoleComment) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  const tops = comments.filter(c => c.parentId === null).sort(byCreated)
  return tops.map(top => ({ top, replies: comments.filter(c => c.parentId === top.id).sort(byCreated) }))
}

export const isOpen = (t: Thread) => !t.top.resolved

export interface MentionQuery { start: number; query: string }

/**
 * Is the caret inside an "@name" being typed? Returns where the "@" is and what follows it, or null.
 * The "@" must start the text or follow whitespace (so an email address does not open the picker), and the text after
 * it may contain a single space (first and last name) but no newline.
 */
export function activeMentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/\s/.test(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (/\n/.test(query) || (query.match(/ /g) ?? []).length > 1) return null
  return { start: at, query }
}

/** Replaces the "@query" being typed with "@Name" plus a space (reusing a space that is already there) and says where the caret goes. */
export function insertMention(text: string, mention: MentionQuery, caret: number, name: string): { text: string; caret: number } {
  const spaceFollows = text[caret] === ' '
  const next = `${text.slice(0, mention.start)}@${name}${spaceFollows ? '' : ' '}${text.slice(caret)}`
  return { text: next, caret: mention.start + 1 + name.length + 1 }
}

export interface Mentionable { id: string; name: string }

/** Members whose name matches what has been typed after the "@", best matches first, at most `limit`. */
export function matchMembers(members: Mentionable[], query: string, limit = 5): Mentionable[] {
  const q = query.trim().toLowerCase()
  const starts = members.filter(m => m.name.toLowerCase().startsWith(q))
  const contains = members.filter(m => !m.name.toLowerCase().startsWith(q) && m.name.toLowerCase().includes(q))
  return [...starts, ...contains].slice(0, limit)
}

/**
 * The ids to send as `mentions`: people picked from the list whose "@Name" is still in the text. Deleting the name
 * from the comment un-mentions them, and typing "@Name" by hand does not count (the server only trusts picked ids).
 */
export function mentionIds(text: string, picked: Map<string, string>): string[] {
  return [...picked].filter(([, name]) => text.includes(`@${name}`)).map(([id]) => id)
}

/** Splits a comment into plain and @mention parts, for highlighting the names that were really picked. */
export function splitMentions(text: string, names: string[]): { text: string; mention: boolean }[] {
  const wanted = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length)
  if (wanted.length === 0) return [{ text, mention: false }]
  const escaped = wanted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(@(?:${escaped.join('|')}))`, 'g')
  return text.split(re).filter(p => p !== '').map(p => ({ text: p, mention: re.test(p) && p.startsWith('@') && wanted.some(n => p === `@${n}`) }))
    .map(p => ({ text: p.text, mention: wanted.some(n => p.text === `@${n}`) }))
}

/** "Just now", "5 min ago", "3 h ago", or the date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
