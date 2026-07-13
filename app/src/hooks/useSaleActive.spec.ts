import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSaleActive } from '~/hooks/useSaleActive'

describe('useSaleActive', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is active during the window and collapses to inactive the moment it ends', () => {
    const sale = { priceCredits: 70, compareAtCredits: 100, saleEndsAt: Date.now() + 60_000 }
    const { result } = renderHook(() => useSaleActive(sale))

    expect(result.current).toBe(true)

    // Advance past saleEndsAt → the scheduled repaint recomputes and the sale is now closed.
    act(() => {
      vi.advanceTimersByTime(60_001)
    })
    expect(result.current).toBe(false)
  })

  it('stays active for an open-ended sale (no window) and never arms a timer', () => {
    const sale = { priceCredits: 70, compareAtCredits: 100 }
    const { result } = renderHook(() => useSaleActive(sale))

    expect(result.current).toBe(true)
    act(() => {
      vi.advanceTimersByTime(10 * 24 * 3600_000) // 10 days
    })
    expect(result.current).toBe(true)
  })

  it('is inactive when there is no real discount', () => {
    const { result } = renderHook(() =>
      useSaleActive({ priceCredits: 100, compareAtCredits: 100, saleEndsAt: Date.now() + 60_000 })
    )
    expect(result.current).toBe(false)
  })

  it('is inactive when the window has already closed at mount', () => {
    const { result } = renderHook(() =>
      useSaleActive({ priceCredits: 70, compareAtCredits: 100, saleEndsAt: Date.now() - 1 })
    )
    expect(result.current).toBe(false)
  })
})
