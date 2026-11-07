import { describe, it, expect } from 'vitest'
import { commentDeepLink } from '../deepLink'

describe('commentDeepLink', () => {
  const ids = ['n1', 'n2']
  it('selects the role and opens its comments', () => {
    expect(commentDeepLink('?role=n2&tab=comments', ids)).toEqual({ roleId: 'n2', tab: 'comments' })
  })
  it('selects the role without a tab when none is asked for', () => {
    expect(commentDeepLink('?role=n1', ids)).toEqual({ roleId: 'n1', tab: undefined })
  })
  it('ignores a role that is not on this chart, or no role at all, or an unknown tab', () => {
    expect(commentDeepLink('?role=gone&tab=comments', ids)).toEqual({ roleId: null, tab: undefined })
    expect(commentDeepLink('', ids)).toEqual({ roleId: null, tab: undefined })
    expect(commentDeepLink('?tab=comments', ids)).toEqual({ roleId: null, tab: undefined })
    expect(commentDeepLink('?role=n1&tab=hacks', ids)).toEqual({ roleId: 'n1', tab: undefined })
  })
})
