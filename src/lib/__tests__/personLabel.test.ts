import { describe, it, expect } from 'vitest'
import { personLabel } from '../personLabel'

const members = [
  { user: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@x.test' } },
  { user: { id: 'u-2', name: '', email: 'bo@x.test' } },
]

describe('personLabel (R-52: never show a user id)', () => {
  it('is "You" for the signed-in person and for the unsaved-change marker', () => {
    expect(personLabel('u-1', 'u-1', members)).toBe('You')
    expect(personLabel('You', 'u-1', members)).toBe('You')
  })
  it('is the member name, or the email when they have no name', () => {
    expect(personLabel('u-1', 'u-9', members)).toBe('Ada Lovelace')
    expect(personLabel('u-2', 'u-9', members)).toBe('bo@x.test')
  })
  it('is "a former member" for an id nobody has, and never echoes the id', () => {
    const label = personLabel('user_2AbcXyz', 'u-9', members)
    expect(label).toBe('a former member')
    expect(label).not.toContain('user_2')
    expect(personLabel('user_2AbcXyz', 'u-9', undefined)).toBe('a former member')
  })
  it('is null when nothing was recorded', () => {
    expect(personLabel('', 'u-1', members)).toBeNull()
    expect(personLabel(undefined, 'u-1', members)).toBeNull()
  })
})
