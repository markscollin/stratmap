import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIsPhone, useMediaQuery, PHONE_QUERY } from '../useMediaQuery'
import { installMatchMedia, setScreen, removeMatchMedia } from '../../test/matchMedia'

describe('useMediaQuery', () => {
  afterEach(removeMatchMedia)

  it('is false where matchMedia does not exist', () => {
    removeMatchMedia()
    expect(renderHook(() => useIsPhone()).result.current).toBe(false)
  })

  describe('with matchMedia', () => {
    beforeEach(() => { installMatchMedia(); setScreen('desktop') })

    it('phones are narrower than 768px', () => {
      expect(PHONE_QUERY).toBe('(max-width: 767px)')
    })

    it('follows the screen as it changes', () => {
      const { result } = renderHook(() => useIsPhone())
      expect(result.current).toBe(false)
      setScreen('phone')
      expect(result.current).toBe(true)
      setScreen('desktop')
      expect(result.current).toBe(false)
    })

    it('other queries are independent', () => {
      setScreen('phone')
      expect(renderHook(() => useMediaQuery('(prefers-color-scheme: dark)')).result.current).toBe(false)
    })
  })
})
