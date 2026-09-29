import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLivePricedItems } from '~/hooks/useLivePricedItems'

// 0.28 USD per MANA: 5 MANA is $1.40, which is 14 credits at $0.10 each.
const { readManaUsdRate } = vi.hoisted(() => ({ readManaUsdRate: vi.fn() }))
vi.mock('~/lib/mana-rate', () => ({
  readManaUsdRate,
  manaRateQueryOptions: () => ({ queryKey: ['mana-rate'], queryFn: () => readManaUsdRate() })
}))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const usdRow = { id: 'usd', priceCredits: 69 }
const manaRow = { id: 'mana', priceCredits: 4, manaWei: '5000000000000000000' }

beforeEach(() => {
  readManaUsdRate.mockReset()
  readManaUsdRate.mockResolvedValue({ rate: 28_000_000n, decimals: 8 })
})

describe('when a grid prices rows that may be quoted in either currency', () => {
  it('should leave a USD-quoted row alone, since its credit price is already exact', async () => {
    const { result } = renderHook(() => useLivePricedItems([usdRow]), { wrapper })
    // Converting this one is the opposite mistake: it rendered $6.90 as 6 credits.
    expect(result.current[0].priceCredits).toBe(69)
  })

  it('should re-price a MANA row at the live rate, not the stored number', async () => {
    const { result } = renderHook(() => useLivePricedItems([manaRow]), { wrapper })
    await waitFor(() => expect(result.current[0].priceCredits).toBe(14))
  })

  it('should show the stored price until the rate arrives, so nothing flashes as not-for-sale', () => {
    const { result } = renderHook(() => useLivePricedItems([manaRow]), { wrapper })
    // A card reads priceCredits > 0 as "for sale"; a 0 here would blank every MANA row for a beat.
    expect(result.current[0].priceCredits).toBe(4)
  })

  it('should not read the oracle when no row is MANA-denominated', async () => {
    renderHook(() => useLivePricedItems([usdRow, { id: 'b', priceCredits: 12 }]), { wrapper })
    await waitFor(() => expect(readManaUsdRate).not.toHaveBeenCalled())
  })

  it('should keep the array reference when there is nothing to convert', () => {
    const items = [usdRow]
    const { result } = renderHook(() => useLivePricedItems(items), { wrapper })
    expect(result.current).toBe(items)
  })

  it('should convert only the MANA rows in a mixed grid', async () => {
    const { result } = renderHook(() => useLivePricedItems([usdRow, manaRow]), { wrapper })
    await waitFor(() => expect(result.current[1].priceCredits).toBe(14))
    expect(result.current[0].priceCredits).toBe(69)
  })
})
