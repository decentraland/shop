import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'

/**
 * WHAT AN ITEM PAGE PUTS ON A SHARED LINK.
 *
 * The whole point of the item page's SEO block is that the card carries the ITEM — its own render, its own
 * name, its own description — rather than the generic shop image. That is a property of the mounted page
 * (the thumbnail arrives with the catalog row, several queries deep), so a unit test of the hook cannot
 * see it; this mounts the real page and reads the head it produced.
 *
 * The mock preamble mirrors ItemDetail.spec.tsx: the page pulls checkout, the builder client and the
 * wallet transitively, and those reach ESM directory imports vitest's node resolver cannot follow.
 */

vi.mock('decentraland-transactions', () => ({
  ContractName: { CreditsManager: 'CreditsManager', CollectionStore: 'CollectionStore' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: (name: string) => ({ address: `0x${name}`, name, version: '1', abi: [] }),
  sendMetaTransaction: vi.fn(),
  MetaTransactionError: class MetaTransactionError extends Error {},
  ErrorCode: { USER_DENIED: 'USER_DENIED' }
}))

vi.mock('decentraland-ui2', () => ({
  CircularProgress: ({ size }: { size?: number }) => <span role="progressbar" data-size={size} />
}))

const { fetchCollectionItems } = vi.hoisted(() => ({ fetchCollectionItems: vi.fn() }))
vi.mock('~/lib/collections', () => ({
  fetchCollectionItems,
  fetchCollection: vi
    .fn()
    .mockResolvedValue({ contractAddress: '0xanchor', name: 'Solo Collection', creator: '0xcreator' })
}))

const { useRelatedItems } = vi.hoisted(() => ({ useRelatedItems: vi.fn() }))
vi.mock('~/hooks/useRelatedItems', () => ({ useRelatedItems }))

const { fetchItemDescription } = vi.hoisted(() => ({ fetchItemDescription: vi.fn() }))
vi.mock('~/lib/api', () => ({
  fetchShopListingForItem: vi.fn().mockResolvedValue(null),
  fetchTradeForItem: vi.fn().mockResolvedValue(null),
  fetchItemResales: vi.fn().mockResolvedValue([]),
  fetchItemDescription,
  fetchOwnedToken: vi.fn().mockResolvedValue(null),
  fetchOwnedItemCount: vi.fn().mockResolvedValue(0),
  fetchTokenById: vi.fn().mockResolvedValue(null),
  fetchTrade: vi.fn().mockResolvedValue(null),
  usdWeiToCents: () => 0
}))
vi.mock('~/lib/builder', () => ({ fetchPublishableItems: vi.fn().mockResolvedValue([]) }))
vi.mock('~/lib/buy', () => ({
  cancelListing: vi.fn(),
  GaslessCancelFailedError: class GaslessCancelFailedError extends Error {}
}))
vi.mock('~/lib/analytics', () => ({
  track: vi.fn(),
  itemProps: () => ({}),
  errorCode: () => 'x',
  isUserRejection: () => false
}))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined, isError: false }) }))
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => false }))

const walletState = {
  session: null,
  signIn: vi.fn(),
  connecting: false,
  error: null,
  restore: vi.fn(),
  disconnect: vi.fn()
}
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: unknown) => unknown) => (typeof sel === 'function' ? sel(walletState) : walletState)
}))

import { ItemDetail } from '~/pages/ItemDetail'

const ANCHOR = '0xanchor'
// The shape the content server really returns for an item's art: an absolute, crawler-fetchable URL.
const THUMB = `https://peer.decentraland.org/lambdas/collections/contents/urn:decentraland:matic:collections-v2:${ANCHOR}:1/thumbnail`

function item(overrides: Partial<CatalogItem> & { id: string; name: string }): CatalogItem {
  return {
    creator: '0xcreator',
    contractAddress: ANCHOR,
    itemId: '1',
    category: 'wearable',
    wearableCategory: 'hat',
    rarity: 'rare',
    network: 'MATIC',
    chainId: 80002,
    thumbnail: '',
    priceCredits: 10,
    gender: 'unisex',
    isSmart: false,
    ...overrides
  }
}

function renderPdp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/item/${ANCHOR}/1`]}>
        <Routes>
          <Route path="/item/:contractAddress/:itemId" element={<ItemDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const prop = (key: string) => document.head.querySelector(`meta[property="${key}"]`)?.getAttribute('content')
const metaName = (key: string) => document.head.querySelector(`meta[name="${key}"]`)?.getAttribute('content')

beforeEach(() => {
  vi.clearAllMocks()
  useRelatedItems.mockReturnValue({ items: [], isFetched: true })
  fetchItemDescription.mockResolvedValue('')
  // index.html's static default card, so the "replaced by the item's own" assertions are meaningful.
  document.head.innerHTML = `
    <meta property="og:image" content="/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Decentraland Shop — wearables and emotes for your avatar" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="robots" content="index,follow" />
  `
})

describe('ItemDetail — the card a shared item link carries', () => {
  describe('when the item resolves with its own artwork', () => {
    beforeEach(() => {
      fetchCollectionItems.mockResolvedValue({
        items: [item({ id: 'a', name: 'Anchor Hat', itemId: '1', thumbnail: THUMB })],
        total: 1
      })
    })

    it("should share the item's own image instead of the generic shop image", async () => {
      renderPdp()

      await waitFor(() => expect(prop('og:image')).toBe(THUMB))
      expect(metaName('twitter:image')).toBe(THUMB)
    })

    it('should describe that image as the item, on a card type that renders square art', async () => {
      renderPdp()

      await waitFor(() => expect(prop('og:image')).toBe(THUMB))
      expect(prop('og:image:alt')).toBe('Anchor Hat')
      expect(metaName('twitter:card')).toBe('summary')
      // The default card's dimensions describe a 1200x630 image and must not survive onto item art.
      expect(document.head.querySelector('meta[property="og:image:width"]')).toBeNull()
      expect(document.head.querySelector('meta[property="og:image:height"]')).toBeNull()
    })

    it('should title the card after the item and mark it a product', async () => {
      renderPdp()

      await waitFor(() => expect(prop('og:title')).toBe('Anchor Hat | Decentraland Shop'))
      expect(prop('og:type')).toBe('product')
      expect(document.title).toBe('Anchor Hat | Decentraland Shop')
    })

    it('should stay indexable', async () => {
      renderPdp()

      await waitFor(() => expect(prop('og:image')).toBe(THUMB))
      expect(metaName('robots')).toBe('index,follow')
    })
  })

  describe('and the thumbnail is not an absolute URL', () => {
    beforeEach(() => {
      // A relative/blank thumbnail cannot be resolved by a crawler, so the page must not offer it.
      fetchCollectionItems.mockResolvedValue({
        items: [item({ id: 'a', name: 'Anchor Hat', itemId: '1', thumbnail: 'thumbnail.png' })],
        total: 1
      })
    })

    it('should fall back to the default shop card rather than share an unresolvable image', async () => {
      renderPdp()

      await waitFor(() => expect(prop('og:title')).toBe('Anchor Hat | Decentraland Shop'))
      expect(prop('og:image')).toContain('og-image.png')
      expect(metaName('twitter:card')).toBe('summary_large_image')
      expect(prop('og:image:width')).toBe('1200')
    })
  })

  describe('and the item does not exist', () => {
    beforeEach(() => {
      fetchCollectionItems.mockResolvedValue({ items: [], total: 0 })
    })

    it('should keep the dead page out of search results', async () => {
      const { container } = renderPdp()

      // Reached the not-found branch, not merely a slow first paint.
      await waitFor(() => expect(container.querySelector('[data-notfound]')).not.toBeNull())
      expect(screen.getByRole('heading', { name: /available/i })).toBeInTheDocument()
      expect(metaName('robots')).toBe('noindex,nofollow')
      expect(document.title).toBe('Item not available | Decentraland Shop')
    })
  })
})
