import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'

/**
 * THE PDP'S CAROUSEL.
 *
 * A small collection used to leave the rail with two or three cards (and a single-item one with a tall blank
 * band) below the fold. It now fills from three data sources behind the same carousel, and what has to be
 * asserted is what the PAGE makes of that: which heading renders, whether "View all" is still honest, and
 * that no heading is ever left standing on its own. A unit test of the hook cannot see any of that, which is
 * why this mounts the page.
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

const { fetchCollectionItems, fetchCatalogItems } = vi.hoisted(() => ({
  fetchCollectionItems: vi.fn(),
  fetchCatalogItems: vi.fn()
}))
vi.mock('~/lib/collections', () => ({
  fetchCollectionItems,
  fetchCatalogItems,
  fetchCollection: vi
    .fn()
    .mockResolvedValue({ contractAddress: '0xanchor', name: 'Solo Collection', creator: '0xcreator' })
}))

// The similar-items tier's own fetching/caching is covered by useRelatedItems.spec — here the hook is a dial
// so a test can say "there are similar items" or "there are none" and assert what the page does with each.
const { useRelatedItems } = vi.hoisted(() => ({ useRelatedItems: vi.fn() }))
vi.mock('~/hooks/useRelatedItems', () => ({ useRelatedItems }))

vi.mock('~/lib/api', () => ({
  fetchUnifiedListingForItem: vi.fn().mockResolvedValue(null),
  fetchTradeForItem: vi.fn().mockResolvedValue(null),
  fetchItemResales: vi.fn().mockResolvedValue([]),
  fetchItemDescription: vi.fn().mockResolvedValue(''),
  fetchItemMeta: vi.fn().mockResolvedValue(null),
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
  fetchCatalogItems.mockResolvedValue({ items: [], total: 0 })
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

/**
 * THE NOT-FOUND WINDOW.
 *
 * A cold deep link is hydrated from the collection read, and that read reports "fetched" one render before
 * its backfill effect applies the matching sibling. For that render the item has no name and nothing is
 * flagged as loading — so the page tore itself down and painted "This item isn't available" over an item it
 * was about to show. The end state was right, which is why every assertion that waits for the item still
 * passed; what it cost was a full unmount/remount of the page mid-load, and under a loaded CI runner the
 * remount was slow enough to time those waits out.
 *
 * A `queryByTestId` after the fact cannot see a state that lasted one commit, so this watches the DOM as it
 * is written and asserts the not-found block was never among the frames.
 */
describe('ItemDetail — the not-found window', () => {
  it('should never paint not-found while a sibling is about to hydrate the item', async () => {
    fetchCollectionItems.mockResolvedValue({ items: [item({ id: 'a', name: 'Anchor Hat', itemId: '1' })], total: 1 })

    let painted = false
    const observer = new MutationObserver(() => {
      painted = painted || !!document.querySelector('[data-notfound]')
    })
    observer.observe(document.body, { childList: true, subtree: true })

    renderPdp()
    await screen.findByRole('heading', { name: 'Anchor Hat' })
    observer.disconnect()

    expect(painted).toBe(false)
  })
})

/**
 * THE RAIL BELOW THE FOLD.
 *
 * A typical collection holds two or three items, so titling the rail after the collection and stopping there
 * left it almost empty. It now fills to a target from three tiers — collection, then the creator's other
 * items, then similar ones — and only a rail made up ENTIRELY of the collection may still say so and link
 * into it. The merge itself is covered by lib/suggestions.spec; this pins what the PAGE does with it.
 */
describe('ItemDetail — the carousel below the fold', () => {
  const sibling = (n: number) => item({ id: `s${n}`, name: `Sibling ${n}`, itemId: String(n + 1) })

  describe('when the collection fills the rail on its own', () => {
    beforeEach(() => {
      fetchCollectionItems.mockResolvedValue({
        items: [
          item({ id: 'a', name: 'Anchor Hat', itemId: '1' }),
          ...Array.from({ length: 15 }, (_, i) => sibling(i + 1))
        ],
        total: 16
      })
    })

    it('should title the rail after the collection and never ask for padding', async () => {
      renderPdp()

      expect(await screen.findByText('More from this collection')).toBeInTheDocument()
      expect(screen.getByText('View all')).toBeInTheDocument()
      expect(screen.queryByText('You might also like')).not.toBeInTheDocument()
      // A padding request must not be spent when the collection can fill the rail.
      expect(fetchCatalogItems).not.toHaveBeenCalled()
      expect(useRelatedItems.mock.calls.every(call => call[2]?.enabled === false)).toBe(true)
    })
  })

  describe('when the collection has only a couple of items', () => {
    beforeEach(() => {
      fetchCollectionItems.mockResolvedValue({
        items: [item({ id: 'a', name: 'Anchor Hat', itemId: '1' }), sibling(1)],
        total: 2
      })
    })

    it('should append the creator’s other items behind the collection’s', async () => {
      fetchCatalogItems.mockResolvedValue({
        items: [item({ id: 'k1', name: 'Creator Hat', contractAddress: '0xother', itemId: '9' })],
        total: 1
      })

      renderPdp()

      expect(await screen.findByText('Creator Hat')).toBeInTheDocument()
      expect(screen.getByText('Sibling 1')).toBeInTheDocument()
      await waitFor(() => expect(fetchCatalogItems).toHaveBeenCalledWith(expect.objectContaining({ isOnSale: true })))
    })

    it('should drop the collection title and its "View all" once the rail is padded', async () => {
      fetchCatalogItems.mockResolvedValue({
        items: [item({ id: 'k1', name: 'Creator Hat', contractAddress: '0xother', itemId: '9' })],
        total: 1
      })

      renderPdp()

      expect(await screen.findByText('You might also like')).toBeInTheDocument()
      expect(screen.queryByText('More from this collection')).not.toBeInTheDocument()
      // "View all" would lead to a collection holding a fraction of what the rail shows.
      expect(screen.queryByText('View all')).not.toBeInTheDocument()
    })

    it('should keep the collection title when the padding tiers had nothing to add', async () => {
      renderPdp()

      await waitFor(() => expect(lastEnabled()).toBe(true))
      expect(await screen.findByText('More from this collection')).toBeInTheDocument()
      expect(screen.getByText('View all')).toBeInTheDocument()
    })
  })

  describe('when the collection has only the item being viewed', () => {
    beforeEach(() => {
      fetchCollectionItems.mockResolvedValue({ items: [item({ id: 'a', name: 'Anchor Hat', itemId: '1' })], total: 1 })
    })

    it('should fall back to similar items once they resolve', async () => {
      useRelatedItems.mockReturnValue({
        items: [item({ id: 'r1', name: 'Similar Hat', contractAddress: '0xother' })],
        isFetched: true
      })

      renderPdp()

      expect(await screen.findByText('You might also like')).toBeInTheDocument()
      expect(screen.getByText('Similar Hat')).toBeInTheDocument()
      expect(screen.queryByText('More from this collection')).not.toBeInTheDocument()
    })

    it('should enable the similar-items request only after the earlier tiers have come up short', async () => {
      renderPdp()

      // Disabled on the first render — at that point an empty carousel is indistinguishable from a
      // collection that simply hasn't loaded, and firing here would swap rails mid-view.
      expect(lastEnabled()).toBe(false)
      await waitFor(() => expect(lastEnabled()).toBe(true))
      // …and the creator tier is asked too: a one-item collection has both padding tiers to fall through.
      await waitFor(() => expect(fetchCatalogItems).toHaveBeenCalled())
    })

    it('should render no rail at all — not a bare heading — when no tier has anything', async () => {
      renderPdp()

      await waitFor(() => expect(lastEnabled()).toBe(true))
      expect(screen.queryByText('You might also like')).not.toBeInTheDocument()
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

/**
 * THE PATH THE PDP ACTUALLY TAKES.
 *
 * Review caught that the first version mapped the traits only in api.ts:toCatalogItem — the v2 catalog,
 * which the detail page never reads. Arriving from the grid, `current` is seeded from /v3/catalog/shop,
 * whose rows are FLAT: no `data` object, so no loop / hasSound / hasGeometry. The backfill cannot rescue it
 * either, since it bails once `current.name` is set, which it always is on that route.
 *
 * So the traits come from the /v3/catalog/items row for this item — the sibling list, already fetched.
 * This drives exactly that shape: a named `current` with no traits, and a sibling that has them.
 */
describe('emote chips when the page arrives from the flat shop feed', () => {
  it('reads the traits from the catalogue row rather than showing nothing', async () => {
    // What the grid hands over: a name, and no emote traits at all.
    const fromGrid = item({ id: 'a', name: 'Laser Face', itemId: '1', category: 'emote' })
    expect(fromGrid.emoteLoop).toBeUndefined()

    // What /v3/catalog/items returns for the same item.
    fetchCollectionItems.mockResolvedValue({
      items: [
        item({
          id: 'a',
          name: 'Laser Face',
          itemId: '1',
          category: 'emote',
          emoteLoop: true,
          emoteHasProps: true
        })
      ],
      total: 1
    })

    // Seeded through router state, exactly as the grid does it — that is what makes `current.name` set and
    // the backfill bail out. Rendering without it would hydrate from the siblings and pass either way.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[{ pathname: `/item/${ANCHOR}/1`, state: { item: fromGrid } }]}>
          <Routes>
            <Route path="/item/:contractAddress/:itemId" element={<ItemDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByTestId('detail-play-mode')).toHaveTextContent(/play loop/i)
    expect(screen.getByTestId('detail-props')).toBeInTheDocument()
  })
})
