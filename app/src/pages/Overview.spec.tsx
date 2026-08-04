import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'

/**
 * What the home page OCCUPIES while it is still loading.
 *
 * The page paints its sections as their feeds answer, so anything that renders nothing while it waits
 * arrives by pushing whatever is already on screen downwards. Two sections did exactly that: the second
 * carousel was gated on `items.length > 12`, which is unknowable until the one query behind both rails
 * lands, and each rail's page-indicator strip appeared only once the rail knew its page count. Measured in
 * a browser, the last section heading on the page sat at y=849 at first paint and y=1783 once everything
 * settled — 934px of the page sliding under the reader (1067px at 375px).
 *
 * So these specs asserts the SHAPE of the loading page: every section present, with a placeholder for
 * every card it is about to show. The pixel proof that the shapes match is in e2e/overview-layout.e2e.ts,
 * which measures both states in a real browser; jsdom has no layout to measure.
 */

const { fetchShopItems } = vi.hoisted(() => ({ fetchShopItems: vi.fn() }))
vi.mock('~/lib/api', () => ({ fetchShopItems }))
// The cards, and the three self-fetching sections under the rails, each have their own coverage. Here they
// are stand-ins so what is asserted is the page's own reservation rather than theirs.
vi.mock('~/components/AssetCard', () => ({ AssetCard: () => <div data-testid="card" /> }))
vi.mock('~/components/OutfitsRow', () => ({ OutfitsRow: () => <div data-testid="outfits-row" /> }))
vi.mock('~/components/FollowedCreatorsRow', () => ({ FollowedCreatorsRow: () => null }))
vi.mock('~/components/TopCreators', () => ({ TopCreators: () => <h2>Meet Our Top Creators</h2> }))

import { Overview } from './Overview'

// What the page reserves with: six placeholders per rail — more than the five cards the widest tier shows,
// so a loading rail is full at every breakpoint.
const PER_RAIL = 6

function item(i: number): CatalogItem {
  return {
    id: `0xc0-${i}`,
    name: `Item ${i}`,
    contractAddress: '0xc0',
    itemId: String(i),
    category: 'wearable',
    rarity: 'epic',
    priceCredits: 100,
    thumbnail: '',
    creator: '0xcc',
    network: 'MATIC',
    chainId: 80002
  } as CatalogItem
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Overview />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  // A promise that never settles: the page stays in the state these specs are about.
  fetchShopItems.mockReset().mockReturnValue(new Promise(() => {}))
})

describe('the overview while its listings are in flight', () => {
  it('renders BOTH carousels, each with a placeholder rail', async () => {
    renderPage()
    expect(await screen.findByText('Featured Products')).toBeTruthy()
    expect(screen.getByText('New Creations')).toBeTruthy()
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(PER_RAIL * 2)
  })

  it('reserves each rail page-indicator strip instead of letting it arrive with the cards', () => {
    renderPage()
    expect(screen.getAllByTestId('rail-dots-reserved')).toHaveLength(2)
  })

  it('shows no arrows or dots for a rail of placeholders', () => {
    renderPage()
    expect(screen.queryByLabelText(/previous/i)).toBeNull()
    expect(screen.queryByLabelText(/next/i)).toBeNull()
    expect(screen.queryByLabelText(/page 1/i)).toBeNull()
  })

  it('never shows the empty state while it is still loading', () => {
    renderPage()
    expect(screen.queryByText(/new drops are on the way/i)).toBeNull()
  })
})

describe('the overview once its listings land', () => {
  it('replaces every placeholder with a card, on both rails', async () => {
    fetchShopItems.mockResolvedValue({ items: Array.from({ length: 24 }, (_, i) => item(i)), total: 24 })
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('card')).toHaveLength(24))
    expect(screen.queryByTestId('skeleton-card')).toBeNull()
    expect(screen.getByText('New Creations')).toBeTruthy()
  })

  it('keeps the second rail out when there is not a second page of listings to fill it', async () => {
    fetchShopItems.mockResolvedValue({ items: Array.from({ length: 6 }, (_, i) => item(i)), total: 6 })
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('card')).toHaveLength(6))
    expect(screen.queryByText('New Creations')).toBeNull()
  })
})
