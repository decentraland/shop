import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useScrollTopOnChange } from '~/hooks/useScrollTopOnChange'

const scrollTo = vi.fn()

beforeEach(() => {
  scrollTo.mockClear()
  vi.stubGlobal('scrollTo', scrollTo)
})

describe('useScrollTopOnChange', () => {
  it('should not move the viewport on arrival, so a restored position survives', () => {
    renderHook(() => useScrollTopOnChange('all:'))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('should go to the top when the key changes', () => {
    const { rerender } = renderHook(({ key }) => useScrollTopOnChange(key), { initialProps: { key: 'all:' } })

    rerender({ key: 'emote:' })

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('should stay put across re-renders that do not change the key', () => {
    // The grid re-renders constantly — every page of results, every hover. Only a NEW key is a new set.
    const { rerender } = renderHook(({ key }) => useScrollTopOnChange(key), { initialProps: { key: 'all:' } })

    rerender({ key: 'all:' })
    rerender({ key: 'all:' })

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('should go to the top again on each further change', () => {
    const { rerender } = renderHook(({ key }) => useScrollTopOnChange(key), { initialProps: { key: 'all:' } })

    rerender({ key: 'wearable:' })
    rerender({ key: 'wearable:Head' })
    rerender({ key: 'emote:' })

    expect(scrollTo).toHaveBeenCalledTimes(3)
  })
})
