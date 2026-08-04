import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { UnifiedListing } from '~/lib/api'

/**
 * The home page: what it FETCHES, and what it OCCUPIES while those fetches are in flight.
 *
 * Two properties are asserted here because they are two halves of the same page:
 *
 * - The top rail is a real ranking (`/v3/catalog/trending`), not a slice of the newest browse feed. A row
 *   titled Trending that is fed by "the newest twelve" is a lie however it is titled, so these specs check
 *   the call as well as the cards.
 * - The page paints its sections as their feeds answer, so a section that renders nothing while it waits
 *   arrives by pushing whatever is on screen downwards. Measured in a browser, the last section heading sat
 *   at y=849 at first paint and y=1783 once settled — 934px of page sliding under the reader (1067px at
 *   375px). So the loading page must have every section present, with a placeholder for every card it is
 *   about to show. The pixel proof is in e2e/overview-layout.e2e.ts; jsdom has no layout to measure.
 */

// The page's data layer. Both rails are stubbed so each test can hold one open and let the other settle.
const { fetchShopItems, fetchTrendingItems } = vi.hoisted(() => ({
  fetchShopItems: vi.fn(),
  fetchTrendingItems: vi.fn()
}))
vi.mock('~/lib/api', () => ({ fetchShopItems, fetchTrendingItems }))

// The secondary-sales feature flag, which decides whether the trending row may show resales at all.
const { useSecondarySales } = vi.hoisted(() => ({ useSecondarySales: vi.fn(() => false) }))
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales }))

// Sibling sections self-fetch (outfits from shop-server, creators from the rankings feed) and have their own
// coverage. Here they are stand-ins so what is asserted is this page's own behaviour rather than theirs.
vi.mock('~/components/OutfitsRow', () => ({ OutfitsRow: () => null }))
vi.mock('~/components/TopCreators', () => ({ TopCreators: () => null }))
vi.mock('~/components/FollowedCreatorsRow', () => ({ FollowedCreatorsRow: () => null }))

// AssetCard stays REAL — the credit price it renders is one of the things under test, and a stub card would
// make the placeholder-to-card counts meaningless too. These are the seams it reaches through that do not
// resolve (or do not matter) here.
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

// What the page reserves with: six placeholders per rail — more than the five cards the widest tier shows,
// so a loading rail is full at every breakpoint.
const PER_RAIL = 6

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

/** A listing for the New Creations rail, named by index so an offset slice is visible in the assertion. */
function listing(i: number): UnifiedListing {
  return trendingItem({ id: `listing-${i}`, tradeId: `listing-${i}`, itemId: String(i), name: `Item ${i}` })
}

/** A promise that never settles: the page stays in the state the loading specs are about. */
const pending = () => new Promise<never>(() => {})

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
  return fetchTrendingItems.mock.calls.at(-1)![0]
}

beforeEach(() => {
  vi.clearAllMocks()
  useSecondarySales.mockReturnValue(false)
  fetchTrendingItems.mockResolvedValue([])
  fetchShopItems.mockResolvedValue({ items: [], total: 0 })
})

describe('when the home page renders its trending row', () => {
  it('should ask for the TRENDING ranking, not for a slice of the newest browse feed', async () => {
    fetchTrendingItems.mockResolvedValue([trendingItem()])

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
    fetchTrendingItems.mockResolvedValue([
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
    fetchTrendingItems.mockResolvedValue([
      trendingItem({ source: 'legacy', manaWei: '14000000000000000000', priceCredits: 7 })
    ])

    renderOverview()

    await waitFor(() => expect(screen.getByTestId('card-price').textContent).toContain('7'))
  })

  it('should keep the server ranking order instead of reordering the cards', async () => {
    fetchTrendingItems.mockResolvedValue([
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
    fetchTrendingItems.mockResolvedValue([])

    renderOverview()

    // An empty rail titled "Trending Products" is worse than no rail, and falling back to a non-trending
    // feed would make the title a lie.
    await waitFor(() => expect(fetchTrendingItems).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Trending Products')).not.toBeInTheDocument())
  })

  it('should hide the row when the ranking request fails rather than showing an empty one', async () => {
    fetchTrendingItems.mockRejectedValue(new Error('fetchTrendingItems 503'))

    renderOverview()

    await waitFor(() => expect(fetchTrendingItems).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Trending Products')).not.toBeInTheDocument())
  })
})

describe('the overview while its feeds are in flight', () => {
  beforeEach(() => {
    fetchShopItems.mockReturnValue(pending())
    fetchTrendingItems.mockReturnValue(pending())
  })

  it('renders BOTH rails, each with a placeholder rail', async () => {
    renderOverview()

    expect(await screen.findByText('Trending Products')).toBeTruthy()
    expect(screen.getByText('New Creations')).toBeTruthy()
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(PER_RAIL * 2)
  })

  it('reserves each rail page-indicator strip instead of letting it arrive with the cards', () => {
    renderOverview()

    expect(screen.getAllByTestId('rail-dots-reserved')).toHaveLength(2)
  })

  it('shows no arrows or dots for a rail of placeholders', () => {
    renderOverview()

    expect(screen.queryByLabelText(/previous/i)).toBeNull()
    expect(screen.queryByLabelText(/next/i)).toBeNull()
    expect(screen.queryByLabelText(/page 1/i)).toBeNull()
  })

  it('never shows the empty state while it is still loading', () => {
    renderOverview()

    expect(screen.queryByText(/new drops are on the way/i)).toBeNull()
  })
})

describe('the overview once its feeds land', () => {
  it('replaces every placeholder with a card, on both rails', async () => {
    fetchShopItems.mockResolvedValue({ items: Array.from({ length: 12 }, (_, i) => listing(i)), total: 12 })
    fetchTrendingItems.mockResolvedValue([trendingItem({ id: 't1', tradeId: 't1' })])

    renderOverview()

    await waitFor(() => expect(screen.getAllByTestId('card')).toHaveLength(13))
    expect(screen.queryByTestId('skeleton-card')).toBeNull()
    expect(screen.getByText('Trending Products')).toBeTruthy()
    expect(screen.getByText('New Creations')).toBeTruthy()
  })

  // New Creations used to render `items.slice(12, 24)`, offset only because the Featured row consumed the
  // first twelve. With Featured replaced by Trending — which has its own query — that offset left the twelve
  // NEWEST creations rendered nowhere, and a catalogue of twelve rows showed no rail at all.
  it('shows the newest listings rather than an offset slice of them', async () => {
    fetchShopItems.mockResolvedValue({ items: Array.from({ length: 12 }, (_, i) => listing(i)), total: 12 })

    renderOverview()

    await waitFor(() => expect(screen.getAllByTestId('card')).toHaveLength(12))
    expect(screen.getByText('Item 0')).toBeTruthy()
    expect(screen.getByText('Item 11')).toBeTruthy()
  })

  // …and the query asks for exactly what the one remaining rail shows. It asked for 48 while two rails split
  // the page between them.
  it('asks the listings feed for one rail worth of rows', async () => {
    renderOverview()

    await waitFor(() => expect(fetchShopItems).toHaveBeenCalled())
    expect(fetchShopItems.mock.calls.at(-1)![0]).toMatchObject({ first: 12, sortBy: 'newest', listingType: 'primary' })
  })
})
