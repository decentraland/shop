import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSuggestedForYou } from '~/hooks/useSuggestedForYou'
import { fetchSuggestedItems, type SuggestedItem } from '~/lib/api'
import { useWallet } from '~/store/wallet'

vi.mock('~/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('~/lib/api')>()
  return { ...actual, fetchSuggestedItems: vi.fn() }
})
vi.mock('~/hooks/useSuggestedForYouEnabled', () => ({ useSuggestedForYouEnabled: () => true }))
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))
// One viewed item, so the hook has a signal to ask with while signed out.
vi.mock('~/lib/recently-viewed', () => ({
  getRecentlyViewed: () => [{ id: '0xviewed-1', contractAddress: '0xviewed', itemId: '1' }]
}))

// ~0.27 USD per MANA: the rate at which the home page's other rails priced these same rows.
const { manaRate } = vi.hoisted(() => ({
  manaRate: { data: { rate: 26960836n, decimals: 8 }, isLoading: false, isError: false, refetch: vi.fn() }
}))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => manaRate }))

function row(overrides: Partial<SuggestedItem>): SuggestedItem {
  return {
    contractAddress: '0xaaa',
    itemId: '1',
    name: 'Item',
    priceCredits: 1,
    manaWei: null,
    reason: { kind: 'co_owned', itemId: '0xowned-1' },
    score: 1,
    ...overrides
  } as SuggestedItem
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useSuggestedForYou', () => {
  beforeEach(() => {
    useWallet.setState({ session: null, restored: true })
    vi.mocked(fetchSuggestedItems).mockResolvedValue({
      personalized: true,
      algorithm: 'v1',
      data: [
        // The server converted 10 MANA at its own stale rate. The Trending rail beside it shows 27.
        row({ itemId: '1', priceCredits: 9, manaWei: '10000000000000000000' }),
        row({ itemId: '2', priceCredits: 64, manaWei: null })
      ]
    })
  })

  it('prices a MANA row at the live rate, so the card agrees with the rails beside it and with checkout', async () => {
    const { result } = renderHook(() => useSuggestedForYou(12), { wrapper })
    await waitFor(() => expect(result.current.result).toBeDefined())
    expect(result.current.result?.data[0].priceCredits).toBe(27)
  })

  it('leaves a row with no MANA price at the credit price the server set', async () => {
    const { result } = renderHook(() => useSuggestedForYou(12), { wrapper })
    await waitFor(() => expect(result.current.result).toBeDefined())
    expect(result.current.result?.data[1].priceCredits).toBe(64)
  })

  it('keeps what the rail needs besides the price', async () => {
    const { result } = renderHook(() => useSuggestedForYou(12), { wrapper })
    await waitFor(() => expect(result.current.result).toBeDefined())
    expect(result.current.result?.personalized).toBe(true)
    expect(result.current.result?.data[0].reason).toEqual({ kind: 'co_owned', itemId: '0xowned-1' })
  })
})
