import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { balanceLabel, useBalance } from '~/hooks/useBalance'

const { getUsdBalance } = vi.hoisted(() => ({ getUsdBalance: vi.fn() }))
vi.mock('~/lib/credits', () => ({ getUsdBalance }))

describe('when labelling a credit balance for display', () => {
  it('should show a dash on a failed fetch so a transient error never reads as "0 credits"', () => {
    expect(balanceLabel(undefined, true)).toBe('—')
    // Even if stale data is present, an error still shows the dash (fail-safe, U3).
    expect(balanceLabel({ balanceCents: 5000, credits: 500 }, true)).toBe('—')
  })

  it('should show the credit count when the balance is known and the fetch is healthy', () => {
    expect(balanceLabel({ balanceCents: 5000, credits: 500 }, false)).toBe(500)
    expect(balanceLabel({ balanceCents: 0, credits: 0 }, false)).toBe(0)
  })

  it('should show 0 while loading (balance undefined, no error)', () => {
    expect(balanceLabel(undefined, false)).toBe(0)
  })
})

/**
 * Held credits come back on a server-side sweep. There is no client event behind it, so without this the
 * badge explaining the hold would sit there until something else happened to refetch — and `staleTime`
 * is 30s, so even a remount would not do it.
 */
describe('when some of the balance is held', () => {
  const identity = {} as never
  const session = { address: '0xabc', identity } as never

  function renderBalance() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return renderHook(() => useBalance(session), { wrapper })
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getUsdBalance.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should keep polling while credits are held, so the hold clears on its own', async () => {
    getUsdBalance.mockResolvedValue({
      balanceCents: 100,
      credits: 10,
      held: { cents: 30, credits: 3, releasesAtSeconds: 1, heldUntilSeconds: 2, purchases: [] }
    })

    const { result } = renderBalance()
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(getUsdBalance).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000)
    })

    await waitFor(() => expect(getUsdBalance.mock.calls.length).toBeGreaterThan(1))
  })

  it('should not poll at all when nothing is held, so an ordinary session costs one request', async () => {
    getUsdBalance.mockResolvedValue({ balanceCents: 100, credits: 10 })

    const { result } = renderBalance()
    await waitFor(() => expect(result.current.data).toBeDefined())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(getUsdBalance).toHaveBeenCalledTimes(1)
  })
})

/**
 * The moment an estimate runs out is when the buyer is most likely to be staring at the badge, and it is
 * also when the money can first have come back. Waiting out a fresh full interval there is the one delay
 * that is actually felt.
 */
describe('when a held estimate is about to run out', () => {
  const identity = {} as never
  const session = { address: '0xabc', identity } as never

  function renderBalance() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return renderHook(() => useBalance(session), { wrapper })
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getUsdBalance.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should ask again just after the estimate passes, not a whole interval later', async () => {
    const dueInSeconds = 4
    getUsdBalance.mockResolvedValue({
      balanceCents: 100,
      credits: 10,
      held: {
        cents: 30,
        credits: 3,
        releasesAtSeconds: Math.floor(Date.now() / 1000) + dueInSeconds,
        purchases: []
      }
    })

    const { result } = renderBalance()
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(getUsdBalance).toHaveBeenCalledTimes(1)

    // Past the estimate but far short of the 15s fallback cadence.
    await act(async () => {
      await vi.advanceTimersByTimeAsync((dueInSeconds + 2) * 1000)
    })

    await waitFor(() => expect(getUsdBalance.mock.calls.length).toBeGreaterThan(1))
  })
})
