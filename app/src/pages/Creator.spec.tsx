import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'

// Creator pulls the card/cart stack transitively (checkout → decentraland-transactions cross-chain),
// which doesn't resolve under vitest — mock those seams. What matters here is which feed the grid asks
// for and what it renders when that feed comes back empty.
const fetchCatalogItems = vi.fn()
const fetchCreatorCollections = vi.fn()
vi.mock('~/lib/collections', () => ({
  fetchCatalogItems: (...args: unknown[]) => fetchCatalogItems(...args),
  fetchCreatorCollections: (...args: unknown[]) => fetchCreatorCollections(...args)
}))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined, isError: false, isPending: false }) }))
vi.mock('~/lib/analytics', () => ({ track: vi.fn(), errorCode: () => 'x', isUserRejection: () => false }))
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: { name: 'Metamoves' } }) }))
vi.mock('~/components/CreatorHero', () => ({ CreatorHero: () => <div data-testid="creator-hero" /> }))
vi.mock('~/components/AssetCard', () => ({
  AssetCard: ({ item, mode }: { item: CatalogItem; mode?: string }) => (
    <div data-testid="asset-card" data-mode={mode ?? 'shop'}>
      {item.name}
    </div>
  )
}))

import { Creator } from '~/pages/Creator'

const CREATOR = '0xf2cb497ec3fe52d92b29466c0b369a1fee0199fd'

function item(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: '0xcollection-1',
    name: 'Trend MetaMoves',
    creator: CREATOR,
    contractAddress: '0xcollection',
    itemId: '1',
    category: 'emote',
    rarity: 'legendary',
    isSmart: false,
    network: 'MATIC',
    chainId: 137,
    thumbnail: 'thumb.png',
    priceCredits: 0,
    gender: null,
    ...overrides
  }
}

function renderCreator(search = '') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/items/creator/${CREATOR}${search}`]}>
        <Routes>
          <Route path="/items/creator/:address" element={<Creator />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// The grid and the unfiltered baseline both go through fetchCatalogItems. The baseline is the `first: 1`
// call; every other call is a grid page.
function gridCalls() {
  return fetchCatalogItems.mock.calls.map(c => c[0]).filter((f: { first?: number }) => f.first !== 1)
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchCreatorCollections.mockResolvedValue({ collections: [], total: 0 })
})

describe('Creator storefront', () => {
  describe('when every creation is unlisted', () => {
    beforeEach(() => {
      const items = [
        item({ id: 'a-1', name: 'Trend MetaMoves' }),
        item({ id: 'a-2', name: 'Booty MetaMoves' }),
        item({ id: 'a-3', name: 'Iron MetaMoves' })
      ]
      fetchCatalogItems.mockImplementation((filters: { first?: number }) =>
        Promise.resolve(filters.first === 1 ? { items: [], total: 3 } : { items, total: 3 })
      )
    })

    it('should still list them instead of claiming the creator has no items', async () => {
      renderCreator()

      await waitFor(() => expect(screen.getAllByTestId('asset-card')).toHaveLength(3))
      expect(screen.queryByTestId('creator-empty-none')).not.toBeInTheDocument()
      expect(screen.queryByTestId('creator-empty-filters')).not.toBeInTheDocument()
    })

    it('should render them as view cards, since an unlisted item cannot be added to a cart', async () => {
      renderCreator()

      await waitFor(() => expect(screen.getAllByTestId('asset-card')).toHaveLength(3))
      for (const card of screen.getAllByTestId('asset-card')) expect(card).toHaveAttribute('data-mode', 'view')
    })

    it('should show a toolbar count that agrees with the number of cards in the grid', async () => {
      renderCreator()

      await waitFor(() => expect(screen.getAllByTestId('asset-card')).toHaveLength(3))
      expect(screen.getByTestId('browse-count')).toHaveTextContent('3')
    })
  })

  describe('when the creator has both listed and unlisted creations', () => {
    it('should give the listed ones buyable cards and the unlisted ones view cards', async () => {
      const items = [item({ id: 'a-1', priceCredits: 7 }), item({ id: 'a-2', priceCredits: 0 })]
      fetchCatalogItems.mockImplementation((filters: { first?: number }) =>
        Promise.resolve(filters.first === 1 ? { items: [], total: 2 } : { items, total: 2 })
      )

      renderCreator()

      await waitFor(() => expect(screen.getAllByTestId('asset-card')).toHaveLength(2))
      const modes = screen.getAllByTestId('asset-card').map(c => c.getAttribute('data-mode'))
      expect(modes).toEqual(['shop', 'view'])
    })
  })

  describe('when requesting the grid', () => {
    beforeEach(() => {
      fetchCatalogItems.mockResolvedValue({ items: [], total: 0 })
    })

    it('should scope the feed to the creator without filtering on sale status', async () => {
      renderCreator()

      await waitFor(() => expect(gridCalls().length).toBeGreaterThan(0))
      expect(gridCalls()[0]).toMatchObject({ creator: CREATOR, isOnSale: undefined })
    })

    it('should not preselect a category, so an emote-only creator is not shown an empty wearables grid', async () => {
      renderCreator()

      await waitFor(() => expect(gridCalls().length).toBeGreaterThan(0))
      expect(gridCalls()[0].category).toBe('all')
    })
  })

  describe('when the grid comes back empty', () => {
    describe('and the creator has published nothing at all', () => {
      it('should say the creator has published nothing', async () => {
        fetchCatalogItems.mockResolvedValue({ items: [], total: 0 })

        renderCreator()

        await waitFor(() => expect(screen.getByTestId('creator-empty-none')).toBeInTheDocument())
        expect(screen.queryByTestId('creator-empty-filters')).not.toBeInTheDocument()
      })
    })

    describe('and the creator does have creations that the filters exclude', () => {
      it('should blame the filters and offer to clear them, not the creator', async () => {
        fetchCatalogItems.mockImplementation((filters: { first?: number }) =>
          Promise.resolve(filters.first === 1 ? { items: [], total: 24 } : { items: [], total: 0 })
        )

        renderCreator()

        await waitFor(() => expect(screen.getByTestId('creator-empty-filters')).toBeInTheDocument())
        expect(screen.queryByTestId('creator-empty-none')).not.toBeInTheDocument()
        expect(screen.getByTestId('creator-empty-filters')).toHaveTextContent('24')
      })
    })

    describe('and the request failed', () => {
      it('should say the load failed rather than that the creator has no items', async () => {
        fetchCatalogItems.mockRejectedValue(new Error('fetchCatalogItems 500'))

        renderCreator()

        await waitFor(() => expect(screen.getByTestId('creator-error')).toBeInTheDocument())
        expect(screen.queryByTestId('creator-empty-none')).not.toBeInTheDocument()
        expect(screen.queryByTestId('creator-empty-filters')).not.toBeInTheDocument()
      })
    })

    describe('and only the baseline count failed', () => {
      it('should not guess between the two empty reasons and report the failure instead', async () => {
        fetchCatalogItems.mockImplementation((filters: { first?: number }) =>
          filters.first === 1 ? Promise.reject(new Error('boom')) : Promise.resolve({ items: [], total: 0 })
        )

        renderCreator()

        await waitFor(() => expect(screen.getByTestId('creator-empty-error')).toBeInTheDocument())
        expect(screen.queryByTestId('creator-empty-none')).not.toBeInTheDocument()
      })
    })
  })

  describe('when rendering the filter sidebar', () => {
    beforeEach(() => {
      fetchCatalogItems.mockResolvedValue({ items: [], total: 0 })
    })

    it('should put the rarity and price filters in the sidebar, not in a top dropdown row', async () => {
      renderCreator()

      const sidebar = await screen.findByTestId('creator-sidebar')
      expect(sidebar).toContainElement(screen.getByTestId('rarity-filter'))
      expect(sidebar).toContainElement(screen.getByLabelText('Minimum price'))
    })

    it('should not offer NAMEs, which no creator publishes', async () => {
      renderCreator()

      await screen.findByTestId('creator-sidebar')
      expect(screen.queryByText('NAMEs')).not.toBeInTheDocument()
    })
  })

  /**
   * The count used to render a bare '…' while it loaded — announced as an ellipsis by a screen reader, and
   * a different width from the text replacing it, so the bar resized under the reader.
   */
  describe('when the collections count has not landed', () => {
    it('should shimmer instead of showing an ellipsis', async () => {
      fetchCatalogItems.mockResolvedValue({ items: [], total: 0 })
      fetchCreatorCollections.mockReturnValue(new Promise(() => {}))

      renderCreator('?collections')

      const count = await screen.findByTestId('creator-collections-count')
      expect(screen.getByTestId('creator-collections-count-skeleton')).toBeInTheDocument()
      expect(count.textContent).not.toContain('…')
      expect(count).toHaveAttribute('aria-busy', 'true')
    })

    it('should drop the shimmer for the real count', async () => {
      fetchCatalogItems.mockResolvedValue({ items: [], total: 0 })
      fetchCreatorCollections.mockResolvedValue({ collections: [], total: 3 })

      renderCreator('?collections')

      const count = await screen.findByTestId('creator-collections-count')
      await waitFor(() => expect(count.textContent).toContain('3'))
      expect(screen.queryByTestId('creator-collections-count-skeleton')).not.toBeInTheDocument()
      expect(count).not.toHaveAttribute('aria-busy')
    })
  })
})
