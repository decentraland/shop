import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'

/**
 * THE PDP'S CAROUSEL FALLBACK.
 *
 * A single-item collection used to leave the rail with nothing to draw and a tall blank band below the fold.
 * The fix is a second data source behind the same carousel, and what has to be asserted is the SWAP: which
 * rail renders, under which heading, and that neither one leaves a heading standing on its own. A unit test
 * of the hook cannot see any of that, which is why this mounts the page.
 */

// ItemDetail pulls checkout, the builder client and the wallet transitively, and those reach
// decentraland-transactions' ESM directory imports that vitest's node resolver cannot follow (the same
// workaround MarketCheckout.spec.tsx documents). Mocked wholesale — nothing here touches a contract.
vi.mock('decentraland-transactions', () => ({
  ContractName: { CreditsManager: 'CreditsManager', CollectionStore: 'CollectionStore' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: (name: string) => ({ address: `0x${name}`, name, version: '1', abi: [] }),
  sendMetaTransaction: vi.fn(),
  MetaTransactionError: class MetaTransactionError extends Error {},
  ErrorCode: { USER_DENIED: 'USER_DENIED' }
}))

// decentraland-ui2 (via BuyModal) pulls @dcl/hooks, whose ESM directory imports vitest's node resolver
// cannot follow either — stub the one component the tree uses (same workaround as GetCredits.spec.tsx).
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

// The related rail's own fetching/caching is covered by useRelatedItems.spec — here the hook is a dial so a
// test can say "there are similar items" or "there are none" and assert what the page does with each.
const { useRelatedItems } = vi.hoisted(() => ({ useRelatedItems: vi.fn() }))
vi.mock('~/hooks/useRelatedItems', () => ({ useRelatedItems }))

vi.mock('~/lib/api', () => ({
  fetchShopListingForItem: vi.fn().mockResolvedValue(null),
  fetchTradeForItem: vi.fn().mockResolvedValue(null),
  fetchItemResales: vi.fn().mockResolvedValue([]),
  fetchItemDescription: vi.fn().mockResolvedValue(''),
  fetchOwnedToken: vi.fn().mockResolvedValue(null),
  fetchOwnedItemCount: vi.fn().mockResolvedValue(0),
  fetchTokenById: vi.fn().mockResolvedValue(null),
  fetchTrade: vi.fn().mockResolvedValue(null),
  usdWeiToCents: () => 0
}))
vi.mock('~/lib/builder', () => ({ fetchPublishableItems: vi.fn().mockResolvedValue([]) }))
vi.mock('~/lib/buy', () => ({ cancelListing: vi.fn() }))
vi.mock('~/lib/analytics', () => ({
  track: vi.fn(),
  itemProps: () => ({}),
  errorCode: () => 'x',
  isUserRejection: () => false
}))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined, isError: false }) }))
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => false }))

// No connected wallet: ownership/management branches are a different concern with their own specs.
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

// The `enabled` the page most recently asked for — the page re-renders as its queries settle, so only the
// latest call reflects what it currently believes about the collection.
const lastEnabled = () => useRelatedItems.mock.calls.at(-1)?.[2]?.enabled

beforeEach(() => {
  vi.clearAllMocks()
  useRelatedItems.mockReturnValue({ items: [], isFetched: true })
})

/**
 * "Make an offer" is a bid, and a bid is a secondary-market action the Shop does not offer. The button (and its
 * "coming soon" tooltip) is kept in the tree as a component, so what has to be pinned is that the PAGE no longer
 * mounts it. The not-for-sale price block is asserted first so the absence below can't pass because the page
 * never reached the state the button used to appear in.
 */
describe('ItemDetail — the not-for-sale CTA slot', () => {
  beforeEach(() => {
    fetchCollectionItems.mockResolvedValue({ items: [item({ id: 'a', name: 'Anchor Hat', itemId: '1' })], total: 1 })
  })

  it('should not render the "Make an offer" CTA for an item with no buyable listing', async () => {
    renderPdp()

    // We are in the state that used to carry the button: no listing resolved → "Not for Sale".
    expect(await screen.findByTestId('item-price')).toHaveTextContent(/not for sale/i)
    expect(screen.queryByTestId('make-offer')).not.toBeInTheDocument()
    expect(screen.queryByText(/make an offer/i)).not.toBeInTheDocument()
  })
})

describe('ItemDetail — the carousel below the fold', () => {
  describe('when the collection has other items', () => {
    beforeEach(() => {
      fetchCollectionItems.mockResolvedValue({
        items: [
          item({ id: 'a', name: 'Anchor Hat', itemId: '1' }),
          item({ id: 'b', name: 'Sibling Hat', itemId: '2' })
        ],
        total: 2
      })
    })

    it('should show the collection rail and never ask for similar items', async () => {
      renderPdp()

      expect(await screen.findByText('More from this collection')).toBeInTheDocument()
      expect(screen.queryByText('Similar items')).not.toBeInTheDocument()
      // The rail is the point of the request, so it must not be spent when the collection can fill it.
      expect(useRelatedItems.mock.calls.every(call => call[2]?.enabled === false)).toBe(true)
    })
  })

  describe('when the collection has only the item being viewed', () => {
    beforeEach(() => {
      fetchCollectionItems.mockResolvedValue({ items: [item({ id: 'a', name: 'Anchor Hat', itemId: '1' })], total: 1 })
    })

    it('should fall back to the similar-items rail once similar items resolve', async () => {
      useRelatedItems.mockReturnValue({
        items: [item({ id: 'r1', name: 'Similar Hat', contractAddress: '0xother' })],
        isFetched: true
      })

      renderPdp()

      expect(await screen.findByText('Similar items')).toBeInTheDocument()
      expect(screen.getByText('Similar Hat')).toBeInTheDocument()
      expect(screen.queryByText('More from this collection')).not.toBeInTheDocument()
    })

    it('should enable the similar-items request only after the collection has come back empty-handed', async () => {
      renderPdp()

      // Disabled on the first render — at that point an empty carousel is indistinguishable from a
      // collection that simply hasn't loaded, and firing here would swap rails mid-view.
      expect(lastEnabled()).toBe(false)
      await waitFor(() => expect(lastEnabled()).toBe(true))
    })

    it('should render no rail at all — not a bare heading — when there are no similar items either', async () => {
      renderPdp()

      await waitFor(() => expect(lastEnabled()).toBe(true))
      expect(screen.queryByText('Similar items')).not.toBeInTheDocument()
      expect(screen.queryByText('More from this collection')).not.toBeInTheDocument()
    })
  })
})

/**
 * EMOTE PLAYBACK CHIPS.
 *
 * The Shop's detail page showed rarity, category and gender while the marketplace showed the emote's play
 * mode, sound and props as well — so the same emote read as having fewer traits here than there. All three
 * come from fields the catalogue already returns (data.emote loop / hasSound / hasGeometry); nothing new is
 * fetched.
 *
 * `loop` is the one worth pinning: false is not absence. An emote that plays once must SAY so, and only a
 * wearable — where the field is undefined — may show no chip at all.
 */
describe('emote playback chips', () => {
  const emote = (over: Partial<CatalogItem>) =>
    item({ id: 'a', name: 'Laser Face', itemId: '1', category: 'emote', ...over })

  it('says PLAY LOOP for a looping emote', async () => {
    fetchCollectionItems.mockResolvedValue({ items: [emote({ emoteLoop: true })], total: 1 })

    renderPdp()

    expect(await screen.findByTestId('detail-play-mode')).toHaveTextContent(/play loop/i)
  })

  it('says PLAY ONCE when loop is false, rather than hiding the chip', async () => {
    fetchCollectionItems.mockResolvedValue({ items: [emote({ emoteLoop: false })], total: 1 })

    renderPdp()

    expect(await screen.findByTestId('detail-play-mode')).toHaveTextContent(/play once/i)
  })

  it('shows no play-mode chip for a wearable, where the field is undefined', async () => {
    fetchCollectionItems.mockResolvedValue({
      items: [item({ id: 'a', name: 'Anchor Hat', itemId: '1' })],
      total: 1
    })

    renderPdp()

    // The name appears in the heading AND in the collection rail, so anchor on the heading specifically.
    await screen.findByRole('heading', { name: 'Anchor Hat' })
    expect(screen.queryByTestId('detail-play-mode')).toBeNull()
  })

  it('shows sound and props only when the emote has them', async () => {
    fetchCollectionItems.mockResolvedValue({
      items: [emote({ emoteLoop: true, emoteHasSound: true, emoteHasProps: true })],
      total: 1
    })

    renderPdp()

    expect(await screen.findByTestId('detail-sound')).toBeInTheDocument()
    expect(screen.getByTestId('detail-props')).toBeInTheDocument()
  })

  it('omits sound and props when the emote has neither', async () => {
    fetchCollectionItems.mockResolvedValue({
      items: [emote({ emoteLoop: true, emoteHasSound: false, emoteHasProps: false })],
      total: 1
    })

    renderPdp()

    await screen.findByTestId('detail-play-mode')
    expect(screen.queryByTestId('detail-sound')).toBeNull()
    expect(screen.queryByTestId('detail-props')).toBeNull()
  })
})
