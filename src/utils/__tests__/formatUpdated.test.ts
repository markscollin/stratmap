import { describe, it, expect } from 'vitest'
import { formatUpdated } from '../formatUpdated'

const NOW = Date.parse('2026-11-05T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('formatUpdated', () => {
  it('formats recent times relatively', () => {
    expect(formatUpdated(ago(10_000), NOW)).toBe('Just now')
    expect(formatUpdated(ago(60_000), NOW)).toBe('1 minute ago')
    expect(formatUpdated(ago(5 * 3_600_000), NOW)).toBe('5 hours ago')
    expect(formatUpdated(ago(30 * 3_600_000), NOW)).toBe('Yesterday')
    expect(formatUpdated(ago(3 * 86_400_000), NOW)).toBe('3 days ago')
  })

  it('shows a date for older times and nothing for garbage', () => {
    expect(formatUpdated(ago(30 * 86_400_000), NOW)).toMatch(/2026/)
    expect(formatUpdated('not a date', NOW)).toBe('')
  })
})
