import { describe, it, expect } from 'vitest'
import { greetingName } from '../greetingName'

// R-66: the welcome toast greets a person by name, never by their email address or an account id.
describe('greetingName', () => {
  it('the first name, else "there"', () => {
    expect(greetingName('Ada Lovelace')).toBe('Ada')
    expect(greetingName('  Bo ')).toBe('Bo')
    expect(greetingName('ada@example.com')).toBe('there')
    expect(greetingName('user_2abc')).toBe('there')
    expect(greetingName('')).toBe('there')
    expect(greetingName(undefined)).toBe('there')
  })
})
