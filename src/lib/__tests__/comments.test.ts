import { describe, it, expect } from 'vitest'
import { activeMentionQuery, groupThreads, insertMention, matchMembers, mentionIds, splitMentions, timeAgo, type RoleComment } from '../comments'

const c = (id: string, parentId: string | null, createdAt: string, extra: Partial<RoleComment> = {}): RoleComment => ({
  id, nodeId: 'n', parentId, authorId: 'u', authorName: 'U', body: id, mentions: [], createdAt, editedAt: null, deleted: false, resolved: false, resolvedBy: null, ...extra,
})

describe('groupThreads', () => {
  it('groups replies under their first comment, oldest first', () => {
    const threads = groupThreads([
      c('r2', 'a', '2026-01-01T10:03:00Z'), c('b', null, '2026-01-01T10:02:00Z'), c('a', null, '2026-01-01T10:00:00Z'), c('r1', 'a', '2026-01-01T10:01:00Z'),
    ])
    expect(threads.map(t => t.top.id)).toEqual(['a', 'b'])
    expect(threads[0].replies.map(r => r.id)).toEqual(['r1', 'r2'])
    expect(threads[1].replies).toEqual([])
  })
  it('is empty for no comments, and ties are stable', () => {
    expect(groupThreads([])).toEqual([])
    expect(groupThreads([c('b', null, 'x'), c('a', null, 'x')]).map(t => t.top.id)).toEqual(['a', 'b'])
  })
})

describe('activeMentionQuery', () => {
  it('opens after an @ at the start or after a space', () => {
    expect(activeMentionQuery('@al', 3)).toEqual({ start: 0, query: 'al' })
    expect(activeMentionQuery('hi @', 4)).toEqual({ start: 3, query: '' })
    expect(activeMentionQuery('hi @Ada Lo', 10)).toEqual({ start: 3, query: 'Ada Lo' })
  })
  it('does not open inside an email address or without an @', () => {
    expect(activeMentionQuery('mail me at a@b.com', 18)).toBeNull()
    expect(activeMentionQuery('no mention', 10)).toBeNull()
  })
  it('closes once the text is clearly not a name any more', () => {
    expect(activeMentionQuery('@Ada Lovelace says', 18)).toBeNull()           // a second space
    expect(activeMentionQuery('@Ada\nnext line', 14)).toBeNull()               // a new line
  })
  it('follows the caret, not the end of the text', () => {
    expect(activeMentionQuery('@Ada and more', 4)).toEqual({ start: 0, query: 'Ada' })
    expect(activeMentionQuery('@Ada and more', 12)).toBeNull()            // by now it has two spaces: not a name
  })
})

describe('insertMention', () => {
  it('replaces the typed @query with the name and moves the caret after it', () => {
    const q = activeMentionQuery('hi @ad there', 6)!
    // a space already follows the caret, so it is reused instead of doubled
    expect(insertMention('hi @ad there', q, 6, 'Ada Lovelace')).toEqual({ text: 'hi @Ada Lovelace there', caret: 17 })
  })
  it('adds the space when the mention ends the text', () => {
    const q = activeMentionQuery('hi @gr', 6)!
    expect(insertMention('hi @gr', q, 6, 'Grace Hopper')).toEqual({ text: 'hi @Grace Hopper ', caret: 17 })
  })
})

describe('matchMembers', () => {
  const people = [{ id: '1', name: 'Ada Lovelace' }, { id: '2', name: 'Grace Hopper' }, { id: '3', name: 'Adam Smith' }, { id: '4', name: 'Maria Adams' }]
  it('puts names that start with the query first, then names that contain it', () => {
    expect(matchMembers(people, 'ad').map(m => m.id)).toEqual(['1', '3', '4'])
  })
  it('matches case-insensitively, lists everyone for an empty query, and respects the limit', () => {
    expect(matchMembers(people, 'GRACE').map(m => m.id)).toEqual(['2'])
    expect(matchMembers(people, '', 2)).toHaveLength(2)
    expect(matchMembers(people, 'zzz')).toEqual([])
  })
})

describe('mentionIds', () => {
  const picked = new Map([['u1', 'Ada Lovelace'], ['u2', 'Grace Hopper']])
  it('sends the picked people whose @Name is still in the text', () => {
    expect(mentionIds('@Ada Lovelace please look', picked)).toEqual(['u1'])
    expect(mentionIds('@Ada Lovelace and @Grace Hopper', picked)).toEqual(['u1', 'u2'])
  })
  it('drops people whose name was deleted again, and ignores names typed without picking', () => {
    expect(mentionIds('never mind', picked)).toEqual([])
    expect(mentionIds('@Linus Torvalds hello', picked)).toEqual([])
  })
})

describe('splitMentions', () => {
  it('marks only the names that were really mentioned', () => {
    expect(splitMentions('Hi @Ada Lovelace, and @someone else', ['Ada Lovelace'])).toEqual([
      { text: 'Hi ', mention: false }, { text: '@Ada Lovelace', mention: true }, { text: ', and @someone else', mention: false },
    ])
  })
  it('handles no names, names with regex characters, and the longest name first', () => {
    expect(splitMentions('plain', [])).toEqual([{ text: 'plain', mention: false }])
    expect(splitMentions('@A.B (x)', ['A.B'])).toEqual([{ text: '@A.B', mention: true }, { text: ' (x)', mention: false }])
    expect(splitMentions('@Ada Lovelace', ['Ada', 'Ada Lovelace'])).toEqual([{ text: '@Ada Lovelace', mention: true }])
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2026-11-07T12:00:00Z')
  it('reads naturally', () => {
    expect(timeAgo('2026-11-07T11:59:40Z', now)).toBe('just now')
    expect(timeAgo('2026-11-07T11:55:00Z', now)).toBe('5 min ago')
    expect(timeAgo('2026-11-07T09:00:00Z', now)).toBe('3 h ago')
    expect(timeAgo('2026-10-01T09:00:00Z', now)).toMatch(/2026/)
  })
})
