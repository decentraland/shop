import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { UnifiedListing } from '~/lib/api'

// The page's data layer. Both rails are stubbed so each test controls one and the other stays out of the way.
vi.mock('~/lib/api', () => ({
  fetchShopItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchTrendingItems: vi.fn().mockResolvedValue([])
}))

// The secondary-sales feature flag, which decides whether the row may show resales at all.
const { useSecondarySales } = vi.hoisted(() => ({ useSecondarySales: vi.fn(() => false) }))
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales }))

// Sibling sections self-fetch (outfits from shop-server, creators from the rankings feed) and are not what
// these tests are about.
vi.mock('~/components/OutfitsRow', () => ({ OutfitsRow: () => null }))
vi.mock('~/components/TopCreators', () => ({ TopCreators: () => null }))
vi.mock('~/components/FollowedCreatorsRow', () => ({ FollowedCreatorsRow: () => null }))

// AssetCard stays REAL — the credit price it renders is one of the things under test. These are the seams it
// reaches through that do not resolve (or do not matter) here.
vi.mock('~/lib/analytics', () => ({
  track: vi.fn(),
  errorCode: () => 'x',
  isUserRejection: () => false,
  isPrimaryItem: (item: { itemId?: string | null; tokenId?: string }) => !item.tokenId && !!item.itemId
}))
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: unknown) => unknown) => {
    const state = { session: null, connecting: false, error: null }
    return typeof sel === 'function' ? sel(state) : state
  }
}))

import { Overview } from '~/pages/Overview'
import { fetchTrendingItems } from '~/lib/api'

function trendingItem(overrides: Partial<UnifiedListing> = {}): UnifiedListing {
  return {
    id: 'trade-1',
    tradeId: 'trade-1',
    name: 'Hot Hat',
    creator: '0xa',
    contractAddress: '0xc0',
    itemId: '5',
    category: 'wearable',
    wearableCategory: 'hat',
    rarity: 'epic',
    network: 'MATIC',
    chainId: 80002,
    thumbnail: '',
    priceCredits: 42,
    gender: 'unisex',
    isSmart: false,
    listingType: 'primary',
    source: 'native',
    acquisition: 'trade',
    manaWei: null,
    available: 10,
    ...overrides
  } as UnifiedListing
}

function renderOverview() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Overview />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function lastTrendingCall() {
  await waitFor(() => expect(fetchTrendingItems).toHaveBeenCalled())
  return vi.mocked(fetchTrendingItems).mock.calls.at(-1)![0]
}

beforeEach(() => {
  vi.clearAllMocks()
  useSecondarySales.mockReturnValue(false)
  vi.mocked(fetchTrendingItems).mockResolvedValue([])
})

describe('when the home page renders its trending row', () => {
  it('should ask for the TRENDING ranking, not for a slice of the newest browse feed', async () => {
    vi.mocked(fetchTrendingItems).mockResolvedValue([trendingItem()])

    renderOverview()

    // The row this replaces was `fetchShopItems({ sortBy: 'newest' }).slice(0, 12)`. If the trending
    // fetcher is never called, the row is not a trending row however it is titled.
    await waitFor(() => expect(fetchTrendingItems).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('Trending Products')).toBeInTheDocument())
  })

  it('should fill the row with as many slots as the rail shows', async () => {
    renderOverview()

    expect(await lastTrendingCall()).toMatchObject({ first: 12 })
  })

  it('should ask the server for primary listings only while the Shop does not sell resales', async () => {
    useSecondarySales.mockReturnValue(false)

    renderOverview()

    // Server-side, not filtered out of the response: the row is a fixed number of slots, so dropping rows
    // after the fact would silently shrink it.
    expect(await lastTrendingCall()).toMatchObject({ listingType: 'primary' })
  })

  it('should stop constraining the listing type once resales are enabled', async () => {
    useSecondarySales.mockReturnValue(true)

    renderOverview()

    expect(await lastTrendingCall()).toMatchObject({ listingType: undefined })
  })

  it('should render the credit price of every trending card', async () => {
    vi.mocked(fetchTrendingItems).mockResolvedValue([
      trendingItem({ id: 'a', tradeId: 'a', name: 'Hot Hat', priceCredits: 42 }),
      trendingItem({ id: 'b', tradeId: 'b', itemId: '6', name: 'Warm Cap', priceCredits: 7 })
    ])

    renderOverview()

    await waitFor(() => expect(screen.getAllByTestId('card-price')).toHaveLength(2))
    const prices = screen.getAllByTestId('card-price').map(el => el.textContent)
    expect(prices.some(p => p?.includes('42'))).toBe(true)
    expect(prices.some(p => p?.includes('7'))).toBe(true)
  })

  it('should render a rate-converted legacy row at its credit price like any other', async () => {
    vi.mocked(fetchTrendingItems).mockResolvedValue([
      trendingItem({ source: 'legacy', manaWei: '14000000000000000000', priceCredits: 7 })
    ])

    renderOverview()

    await waitFor(() => expect(screen.getByTestId('card-price').textContent).toContain('7'))
  })

  it('should keep the server ranking order instead of reordering the cards', async () => {
    vi.mocked(fetchTrendingItems).mockResolvedValue([
      trendingItem({ id: 'a', tradeId: 'a', itemId: '1', name: 'Third cheapest', priceCredits: 90 }),
      trendingItem({ id: 'b', tradeId: 'b', itemId: '2', name: 'Cheapest', priceCredits: 1 }),
      trendingItem({ id: 'c', tradeId: 'c', itemId: '3', name: 'Middle', priceCredits: 50 })
    ])

    renderOverview()

    await waitFor(() => expect(screen.getAllByTestId('card')).toHaveLength(3))
    const names = screen.getAllByTestId('card').map(card => card.textContent)
    expect(names[0]).toContain('Third cheapest')
    expect(names[1]).toContain('Cheapest')
    expect(names[2]).toContain('Middle')
  })

  it('should hide the row entirely when nothing is trending', async () => {
    vi.mocked(fetchTrendingItems).mockResolvedValue([])

    renderOverview()

    // An empty rail titled "Trending Products" is worse than no rail, and falling back to a non-trending
    // feed would make the title a lie.
    await waitFor(() => expect(fetchTrendingItems).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Trending Products')).not.toBeInTheDocument())
  })

  it('should hide the row when the ranking request fails rather than showing an empty one', async () => {
    vi.mocked(fetchTrendingItems).mockRejectedValue(new Error('fetchTrendingItems 503'))

    renderOverview()

    await waitFor(() => expect(fetchTrendingItems).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Trending Products')).not.toBeInTheDocument())
  })
})
