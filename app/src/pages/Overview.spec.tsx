import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
const { useSecondaryPurchases } = vi.hoisted(() => ({ useSecondaryPurchases: vi.fn(() => false) }))
vi.mock('~/hooks/useSecondaryPurchases', () => ({ useSecondaryPurchases }))

// The creator-sales flag, which is what lets the Best Deals rail exist at all. On by default here so the
// rail's own specs are about the rail; the one case below turns it off.
const { useCreatorSalesEnabled } = vi.hoisted(() => ({ useCreatorSalesEnabled: vi.fn(() => true) }))
vi.mock('~/hooks/useCreatorSalesEnabled', () => ({ useCreatorSalesEnabled }))

// Sibling sections self-fetch (outfits from shop-server, creators from the rankings feed) and have their own
// coverage. Here they are stand-ins so what is asserted is this page's own behaviour rather than theirs.
vi.mock('~/components/OutfitsRow', () => ({ OutfitsRow: () => null }))
vi.mock('~/components/TopCreators', () => ({ TopCreators: () => null }))
vi.mock('~/components/FollowedCreatorsRow', () => ({ FollowedCreatorsRow: () => null }))

// The campaign takeover of the hero. Stubbed so these specs are about what the PAGE does with an answer;
// how that answer is derived from the CMS is `useCampaignHero`'s own spec.
const { useCampaignHero } = vi.hoisted(() => ({ useCampaignHero: vi.fn(() => null) }))
vi.mock('~/hooks/useCampaignHero', () => ({ useCampaignHero }))

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

/** A live creator sale for the Best Deals rail: `pct` off a 100-credit compare-at, ending tomorrow. */
function deal(i: number, pct = 30 - i * 5): UnifiedListing {
  return trendingItem({
    id: `deal-${i}`,
    tradeId: `deal-${i}`,
    itemId: `deal-${i}`,
    name: `Deal ${i}`,
    priceCredits: 100 - pct,
    compareAtCredits: 100,
    // MILLISECONDS, and deliberately not the seconds the e2e helper uses. The two build rows at different
    // layers: this one fabricates a CatalogItem, which is post-boundary — `lib/api.ts` multiplies the
    // server's seconds by 1000 on the way in, and `lib/sale.ts` compares against `Date.now()`. Seconds here
    // would put the sale in 1970 and every card would quietly stop striking its old price.
    saleEndsAt: Date.now() + 86_400_000
  })
}

/**
 * The listings feed answers two rails from one fetcher: New Creations (newest primaries) and Best Deals
 * (`discounted: true`). Route each to its own rows so a spec can fill one rail without filling the other.
 */
function feeds({ creations = [], deals = [] }: { creations?: UnifiedListing[]; deals?: UnifiedListing[] }) {
  fetchShopItems.mockImplementation((filters: { discounted?: boolean } = {}) => {
    // `!= null`, not truthiness: `discounted: false` is a real filter — "everything NOT on sale" — and
    // reading it as absent would hand such a spec the creations feed and let it pass on the wrong rows.
    const items = filters.discounted != null && filters.discounted ? deals : creations
    return Promise.resolve({ items, total: items.length })
  })
}

/** A promise that never settles: the page stays in the state the loading specs are about. */
const pending = () => new Promise<never>(() => {})

function renderOverview() {
  // The client is built here and reused by `rerender`, so a re-render keeps the cache a real session would.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // A fresh element each time, around the SAME client: React bails out of a re-render handed the identical
  // element object, and the shared client is what makes a re-render keep the cache a real session would.
  const tree = () => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Overview />
      </MemoryRouter>
    </QueryClientProvider>
  )
  const result = render(tree())
  return { ...result, again: () => result.rerender(tree()) }
}

async function lastTrendingCall() {
  await waitFor(() => expect(fetchTrendingItems).toHaveBeenCalled())
  return fetchTrendingItems.mock.calls.at(-1)![0]
}

beforeEach(() => {
  vi.clearAllMocks()
  useCampaignHero.mockReturnValue(null)
  useSecondaryPurchases.mockReturnValue(false)
  useCreatorSalesEnabled.mockReturnValue(true)
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
    useSecondaryPurchases.mockReturnValue(false)

    renderOverview()

    // Server-side, not filtered out of the response: the row is a fixed number of slots, so dropping rows
    // after the fact would silently shrink it.
    expect(await lastTrendingCall()).toMatchObject({ listingType: 'primary' })
  })

  it('should stop constraining the listing type once resales are enabled', async () => {
    useSecondaryPurchases.mockReturnValue(true)

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
    feeds({ creations: Array.from({ length: 12 }, (_, i) => listing(i)) })
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
    feeds({ creations: Array.from({ length: 12 }, (_, i) => listing(i)) })

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
    expect(fetchShopItems).toHaveBeenCalledWith(
      expect.objectContaining({ first: 12, sortBy: 'newest', listingType: 'primary' })
    )
  })
})

describe('when the home page renders its best deals row', () => {
  it('should ask the listings feed for live sales, biggest discount first, primaries only', async () => {
    renderOverview()

    // The filter and the order are the server's, so this rail and the grid's Deals filter agree. Resales are
    // excluded not as a rule of the rail but as a fact: a creator sets a sale on their own collection.
    await waitFor(() =>
      expect(fetchShopItems).toHaveBeenCalledWith(
        expect.objectContaining({ first: 12, discounted: true, sortBy: 'discount', listingType: 'primary' })
      )
    )
  })

  it('should show the row once there are enough deals to fill it, each card striking its old price', async () => {
    feeds({ deals: [deal(0), deal(1), deal(2)] })

    renderOverview()

    const rail = await screen.findByTestId('best-deals-rail')
    expect(within(rail).getByText('Best Deals')).toBeTruthy()
    expect(within(rail).getAllByTestId('card')).toHaveLength(3)
    expect(within(rail).getAllByTestId('card-price-was')).toHaveLength(3)
  })

  it('should keep the server order instead of reordering the cards', async () => {
    feeds({ deals: [deal(2), deal(0), deal(1)] })

    renderOverview()

    const rail = await screen.findByTestId('best-deals-rail')
    const names = within(rail)
      .getAllByText(/^Deal \d$/)
      .map(el => el.textContent)
    expect(names).toEqual(['Deal 2', 'Deal 0', 'Deal 1'])
  })

  it('should not exist at all while the creator sales flag is off', async () => {
    useCreatorSalesEnabled.mockReturnValue(false)
    feeds({ deals: [deal(0), deal(1), deal(2)] })

    renderOverview()

    // Not merely empty: the feed is never asked. With the flag off the server still answers, minus each
    // row's sale fields, so a rail that fetched anyway would headline "Best Deals" over ordinary prices.
    await waitFor(() => expect(fetchShopItems).toHaveBeenCalled())
    expect(fetchShopItems).not.toHaveBeenCalledWith(expect.objectContaining({ discounted: true }))
    expect(screen.queryByTestId('best-deals-rail')).toBeNull()
  })

  it('should drop the cached deals when the flag is switched off mid-session', async () => {
    feeds({ deals: [deal(0), deal(1), deal(2)] })
    const { again } = renderOverview()
    await screen.findByTestId('best-deals-rail')

    // `enabled: false` only stops the refetch — the cached rows survive, and nothing downstream re-checks
    // the flag. The flag belongs in the query key so turning it off lands on a key with nothing behind it.
    useCreatorSalesEnabled.mockReturnValue(false)
    again()

    await waitFor(() => expect(screen.queryByTestId('best-deals-rail')).toBeNull())
  })

  it('should send "View all" to the grid already filtered to deals', async () => {
    feeds({ deals: [deal(0), deal(1), deal(2)] })

    renderOverview()

    const rail = await screen.findByTestId('best-deals-rail')
    expect(within(rail).getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/items?deals=true')
  })

  it('should hide the row under three deals: two cards do not make a rail', async () => {
    feeds({ deals: [deal(0), deal(1)] })

    renderOverview()

    await waitFor(() => expect(fetchShopItems).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('Trending Products')).toBeTruthy())
    expect(screen.queryByText('Best Deals')).toBeNull()
  })

  it('should hide the row when the request fails rather than showing an empty one', async () => {
    fetchShopItems.mockImplementation((filters: { discounted?: boolean } = {}) =>
      filters.discounted ? Promise.reject(new Error('fetchShopItems 503')) : Promise.resolve({ items: [], total: 0 })
    )

    renderOverview()

    await waitFor(() => expect(fetchShopItems).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('Trending Products')).toBeTruthy())
    expect(screen.queryByText('Best Deals')).toBeNull()
  })

  it('should reserve no placeholders while the deals are in flight', () => {
    fetchShopItems.mockReturnValue(pending())
    fetchTrendingItems.mockReturnValue(pending())

    renderOverview()

    // Most days nothing is on sale; a placeholder rail that vanished on most home loads would be the very
    // jump the other rails' placeholders exist to prevent. Two rails' worth of skeletons, not three.
    expect(screen.queryByTestId('best-deals-rail')).toBeNull()
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(PER_RAIL * 2)
  })
})

describe('the promo tiles', () => {
  // Each promo advertises one kind of collectible, so its CTA has to land on that kind. "Find your look"
  // used to drop the visitor on the unfiltered grid, where the wearables it had just shown were mixed in
  // with everything else.
  it('should send the wearables promo to the wearables category, like the emotes one', async () => {
    renderOverview()

    const wearables = await screen.findByRole('link', { name: /explore wearables/i })
    const emotes = await screen.findByRole('link', { name: /explore emotes/i })

    expect(wearables).toHaveAttribute('href', '/items?category=wearable')
    expect(emotes).toHaveAttribute('href', '/items?category=emote')
  })
})

/**
 * The hero is the Shop's own art, headline and credits CTA — until a campaign takes it over.
 *
 * The takeover reuses this markup rather than stacking a second banner above it, so what these specs
 * guard is the swap: every part moves together, and the default comes back the moment the campaign is
 * gone. That last property is what lets marketing end an event by unpublishing an entry, with no deploy.
 */
describe('the home hero', () => {
  const campaignHero = {
    title: 'Halloween is here',
    desktopImage: 'https://cms-images.decentraland.org/wide.png',
    mobileImage: 'https://cms-images.decentraland.org/square.png',
    cta: { label: 'Shop the drop', href: 'https://decentraland.org/shop/event' },
    bannerId: 'banner-1',
    campaignName: 'Halloween 2026'
  }

  describe('when no campaign is running', () => {
    it("should show the Shop's own headline and credits CTA", () => {
      renderOverview()

      expect(screen.getByTestId('hero-title').textContent).toBe('A New Way to Shop')
      expect(screen.getByTestId('hero-credits-cta')).toBeInTheDocument()
      expect(screen.queryByTestId('hero-campaign-cta')).not.toBeInTheDocument()
    })
  })

  describe('when a campaign takes the hero over', () => {
    beforeEach(() => {
      useCampaignHero.mockReturnValue(campaignHero as never)
    })

    it('should show the campaign headline instead', () => {
      renderOverview()

      expect(screen.getByTestId('hero-title').textContent).toBe('Halloween is here')
    })

    it('should paint the campaign artwork at both sizes', () => {
      const { container } = renderOverview()

      expect(container.querySelector('picture img')).toHaveAttribute('src', campaignHero.desktopImage)
      expect(container.querySelector('picture source')).toHaveAttribute('srcset', campaignHero.mobileImage)
    })

    it('should replace the credits CTA with the campaign one', () => {
      renderOverview()

      const cta = screen.getByTestId('hero-campaign-cta')
      expect(cta).toHaveAttribute('href', campaignHero.cta.href)
      expect(cta.textContent).toBe('Shop the drop')
      expect(screen.queryByTestId('hero-credits-cta')).not.toBeInTheDocument()
    })

    it('should show no CTA at all when the campaign ships none', () => {
      // The campaign owns the hero completely: an editor who switched the button off wants no button, not
      // the Shop's standing one under their artwork.
      useCampaignHero.mockReturnValue({ ...campaignHero, cta: null } as never)

      renderOverview()

      expect(screen.queryByTestId('hero-campaign-cta')).not.toBeInTheDocument()
      expect(screen.queryByTestId('hero-credits-cta')).not.toBeInTheDocument()
    })
  })
})
