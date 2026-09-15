import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * THE BUYER'S SIDE OF THE SECONDARY PERMISSION, ON THE PRODUCT PAGE.
 *
 * Two surfaces, and the second is the one a flag alone never covered:
 *
 *  - the ITEM page's resale block (lowest price + "view all resellers"), which is fed by a query that is
 *    simply not enabled while the Shop is not selling resales.
 *
 *  - a `/token/:tokenId` DEEP LINK. That route hydrates from /v1/nfts, which hands over the token's open
 *    order — and therefore its tradeId — whatever any flag says. So the page concluded "for sale" and put
 *    a Buy now under it with resales switched off, reachable from a shared URL, a refresh, or a link out
 *    of the Marketplace. No render-time gate on a resale SURFACE closes that, because no resale surface
 *    is involved.
 *
 * The right answer there is NOT-FOR-SALE, not not-found: the copy exists and is listed, just not through
 * the Shop — so the page keeps its hand-off to the Marketplace.
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

const CONTRACT = '0xanchor'
const TOKEN_ID = '526561458342785933489590138418352161594475477002745556271554887681'

// Signed out, so the page takes the BUYER branch: the owner-scoped token lookup never runs and the
// public fallback is what hydrates the page — exactly the shape a shared link arrives in.
const walletState = {
  session: null,
  connecting: false,
  error: null,
  signIn: vi.fn(),
  restore: vi.fn(),
  disconnect: vi.fn()
}
vi.mock('~/store/wallet', () => ({
  useWallet: Object.assign((sel?: (s: typeof walletState) => unknown) => (sel ? sel(walletState) : walletState), {
    getState: () => walletState
  })
}))

vi.mock('~/lib/analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/analytics')>()),
  track: vi.fn()
}))

const { fetchTokenById, fetchItemResales, fetchUnifiedListingForItem } = vi.hoisted(() => ({
  fetchTokenById: vi.fn(),
  fetchItemResales: vi.fn(),
  fetchUnifiedListingForItem: vi.fn()
}))
vi.mock('~/lib/api', () => ({
  fetchShopListingForItem: vi.fn().mockResolvedValue(null),
  fetchUnifiedListingForItem,
  fetchTradeForItem: vi.fn().mockResolvedValue(null),
  fetchTrade: vi.fn().mockResolvedValue(null),
  fetchItemResales,
  fetchItemDescription: vi.fn().mockResolvedValue(''),
  fetchOwnedToken: vi.fn().mockResolvedValue(null),
  fetchOwnedItemCount: vi.fn().mockResolvedValue(0),
  fetchTokenById,
  fetchItemMeta: vi.fn().mockResolvedValue(null),
  usdWeiToCents: () => 0
}))

vi.mock('~/lib/buy', () => ({
  cancelListing: vi.fn(),
  GaslessCancelFailedError: class GaslessCancelFailedError extends Error {}
}))

vi.mock('~/lib/collections', () => ({
  fetchCollectionItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchCollection: vi
    .fn()
    .mockResolvedValue({ contractAddress: '0xanchor', name: 'Solo Collection', creator: '0xdead' })
}))
vi.mock('~/lib/builder', () => ({ fetchPublishableItems: vi.fn().mockResolvedValue([]) }))
vi.mock('~/hooks/useRelatedItems', () => ({ useRelatedItems: () => ({ items: [], isFetched: true }) }))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined, isError: false }) }))

const secondary = { purchases: false }
vi.mock('~/hooks/useSecondaryListings', () => ({ useSecondaryListings: () => false }))
vi.mock('~/hooks/useSecondaryPurchases', () => ({ useSecondaryPurchases: () => secondary.purchases }))

import { ItemDetail } from '~/pages/ItemDetail'
import { useCart } from '~/store/cart'

// A token somebody ELSE owns and has listed — what /v1/nfts reports for a Marketplace resale.
const listedByAnother = () => ({
  id: `${CONTRACT}-${TOKEN_ID}`,
  contractAddress: CONTRACT,
  tokenId: TOKEN_ID,
  itemId: '1',
  name: 'Ruby Red Fascinator',
  thumbnail: '',
  rarity: 'rare',
  category: 'wearable',
  network: 'MATIC',
  chainId: 80002,
  issuedId: '7',
  isOnSale: true,
  listingPrice: 5,
  tradeId: 'resale-trade-1'
})

// The item's own MINT listing, so the sale section can conclude and render the resale block underneath
// it rather than a skeleton. A primary at 9 credits with a cheaper resale at 5 is also the case the
// lowest-price line exists for.
const primaryRow = () => ({
  id: `${CONTRACT}-1`,
  tradeId: 'primary-trade-1',
  tokenId: null,
  itemId: '1',
  contractAddress: CONTRACT,
  name: 'Ruby Red Fascinator',
  thumbnail: '',
  rarity: 'rare',
  category: 'wearable',
  wearableCategory: null,
  creator: '0xdead',
  gender: null,
  priceCredits: 9,
  available: 4,
  network: 'MATIC',
  chainId: 80002,
  source: 'native',
  acquisition: 'trade',
  manaWei: null
})

/**
 * A NATIVE (USD-pegged) resale: fixed credit price, `manaWei: null`.
 *
 * The shape that matters for the durable-resale cases, and the one the page can price on its own — a
 * legacy row's price comes from the oracle, which this file mocks as unresolved, so the sale section would
 * sit on its skeleton forever and hide the very thing under test.
 */
const nativeResaleRow = () => ({ ...resaleRow(), source: 'native' as const, manaWei: null, priceCredits: 5 })

const resaleRow = () => ({
  id: 'resale-row-1',
  tradeId: 'resale-trade-1',
  tokenId: TOKEN_ID,
  itemId: '1',
  contractAddress: CONTRACT,
  name: 'Ruby Red Fascinator',
  thumbnail: '',
  rarity: 'rare',
  category: 'wearable',
  wearableCategory: null,
  creator: '0xdead',
  gender: null,
  priceCredits: 5,
  available: 1,
  network: 'MATIC',
  chainId: 80002,
  source: 'legacy',
  acquisition: 'trade',
  manaWei: '10000000000000000000'
})

function tree(path: string, route: string, state?: unknown) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[state === undefined ? path : { pathname: path, state }]}>
        <Routes>
          <Route path={route} element={<ItemDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderAt(path: string, route: string, state?: unknown) {
  return render(tree(path, route, state))
}

const renderTokenDeepLink = () => renderAt(`/token/${CONTRACT}/${TOKEN_ID}`, '/token/:contractAddress/:tokenId')
const renderItemPage = () => renderAt(`/item/${CONTRACT}/1`, '/item/:contractAddress/:itemId')

const buyNow = () => screen.queryByRole('button', { name: /buy now/i })

beforeEach(() => {
  vi.clearAllMocks()
  secondary.purchases = false
  fetchTokenById.mockResolvedValue(listedByAnother())
  fetchItemResales.mockResolvedValue([])
  fetchUnifiedListingForItem.mockResolvedValue(null)
})

describe('ItemDetail — a deep link to a listed token while the Shop is not selling resales', () => {
  it('should not offer to buy it', async () => {
    renderTokenDeepLink()

    // The page still renders the copy — the link is not broken, the purchase is simply not on offer here.
    expect(await screen.findByRole('heading', { name: /Ruby Red Fascinator/ })).toBeInTheDocument()
    expect(buyNow()).not.toBeInTheDocument()
  })

  it('should not offer to add it to the cart either', async () => {
    renderTokenDeepLink()

    await screen.findByRole('heading', { name: /Ruby Red Fascinator/ })
    expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument()
  })

  it('should still point the visitor at the Marketplace, which can sell it today', async () => {
    renderTokenDeepLink()

    await screen.findByRole('heading', { name: /Ruby Red Fascinator/ })
    expect(await screen.findByTestId('buy-resale')).toBeInTheDocument()
  })
})

describe('ItemDetail — the same deep link once the Shop sells resales', () => {
  beforeEach(() => {
    secondary.purchases = true
  })

  it('should offer to buy it', async () => {
    renderTokenDeepLink()

    await screen.findByRole('heading', { name: /Ruby Red Fascinator/ })
    expect(await screen.findByRole('button', { name: /buy now/i })).toBeInTheDocument()
  })
})

describe('ItemDetail — an item page with open resales', () => {
  beforeEach(() => {
    fetchUnifiedListingForItem.mockResolvedValue(primaryRow())
    fetchItemResales.mockResolvedValue([resaleRow()])
  })

  it('should not read the resales at all while the Shop is not selling them', async () => {
    renderItemPage()

    await screen.findByTestId('item-info')
    // One switch rather than a condition per surface: with the query disabled, the lowest-price line, the
    // resellers modal and the buy-the-cheapest-resale CTA all resolve to empty from the same place.
    expect(fetchItemResales).not.toHaveBeenCalled()
    expect(screen.queryByTestId('lowest-price')).not.toBeInTheDocument()
    expect(screen.queryByTestId('view-resellers')).not.toBeInTheDocument()
  })

  it('should show the lowest resale price and the resellers link once it does', async () => {
    secondary.purchases = true

    renderItemPage()

    expect(await screen.findByTestId('lowest-price')).toBeInTheDocument()
    expect(screen.getByTestId('view-resellers')).toBeInTheDocument()
  })

  it('should ask the server for Marketplace-listed copies, not only Shop-signed ones', async () => {
    secondary.purchases = true

    renderItemPage()

    await screen.findByTestId('lowest-price')
    // Without this the only resales the Shop can ever see are its own USD-pegged ones — and the Shop does
    // not take resale listings, so that set is empty by construction.
    expect(fetchItemResales).toHaveBeenCalledWith(CONTRACT, '1', { includeLegacySecondary: true })
  })
})

/**
 * A NATIVE RESALE AS AN ITEM'S ONLY REMAINING LISTING.
 *
 * Native (USD-pegged) resales are in the catalogue unconditionally — the legacy opt-in governs the other
 * branch — and those orders are DURABLE: turning the permission off cancels none of them. So an item whose
 * mint is gone can have a resale as its only listing, and this page hydrates from that feed. Because the
 * `/item/...` route deliberately strips `tokenId`, such a listing arrives looking item-shaped, and the
 * token-based gate cannot see it. The fix is to ask the server for mints only.
 */
describe('ItemDetail — the item hydrate while the Shop is not selling resales', () => {
  it('should ask the server for mints only, so a resale cannot become the page listing', async () => {
    renderItemPage()

    await screen.findByTestId('item-info')
    expect(fetchUnifiedListingForItem).toHaveBeenCalledWith(CONTRACT, '1', {
      includeLegacySecondary: false,
      listingType: 'primary'
    })
  })

  it('should drop both constraints once resales are on sale', async () => {
    secondary.purchases = true

    renderItemPage()

    await screen.findByTestId('item-info')
    expect(fetchUnifiedListingForItem).toHaveBeenCalledWith(CONTRACT, '1', {
      includeLegacySecondary: true,
      listingType: undefined
    })
  })
})

/**
 * A TOKEN-CARRYING SEED ON THE ITEM ROUTE.
 *
 * `detailRouteFor` sends a resale to `/token/:tokenId`, so nothing in the app links here with one — this
 * is a stale or crafted link. The route already dropped the seed's `tokenId` so the generic page cannot
 * adopt a specific copy, but it kept its `tradeId`, and that is enough to conclude "for sale": the gate
 * reads `current.tokenId`, which is now empty, so the page offered Buy for a resale with resales switched
 * off. Found in review, reproduced before it was fixed.
 */
describe('ItemDetail — a stale seed that names a token, on the item route', () => {
  const seededResale = () => nativeResaleRow()
  const addToCart = () => screen.queryByRole('button', { name: /add to cart/i })

  it('should not offer to buy it while the Shop is not selling resales', async () => {
    secondary.purchases = false
    fetchUnifiedListingForItem.mockResolvedValue(null)

    renderAt(`/item/${CONTRACT}/1`, '/item/:contractAddress/:itemId', { item: seededResale() })

    await screen.findByRole('heading', { name: /Ruby Red Fascinator/ })
    // The seed's trade is dropped with its token, so nothing concludes "for sale" off a resale's order.
    await waitFor(() => expect(buyNow()).not.toBeInTheDocument(), { timeout: 2000 })
    expect(addToCart()).not.toBeInTheDocument()
  })

  it('should keep the presentation the seed arrived with', async () => {
    // Only the MONEY is dropped. The page still renders from the seed while the listing loads — blanking
    // it would trade one wrong answer for a flash of Not Found.
    secondary.purchases = false
    fetchUnifiedListingForItem.mockResolvedValue(null)

    renderAt(`/item/${CONTRACT}/1`, '/item/:contractAddress/:itemId', { item: seededResale() })

    expect(await screen.findByRole('heading', { name: /Ruby Red Fascinator/ })).toBeInTheDocument()
  })

  it('should show the skeleton, not a verdict, while the listing is still loading', async () => {
    // Distinguishing "we do not know yet" from "not for sale": with the seed's price gone, the sale
    // section must not settle on an answer until the authoritative listing lands.
    secondary.purchases = false
    let release: (v: unknown) => void = () => {}
    fetchUnifiedListingForItem.mockReturnValue(new Promise(r => (release = r)))

    renderAt(`/item/${CONTRACT}/1`, '/item/:contractAddress/:itemId', { item: seededResale() })

    expect(await screen.findByTestId('sale-loading')).toBeInTheDocument()
    expect(buyNow()).not.toBeInTheDocument()
    release(null)
  })

  it('should not offer it when the permission goes ON then OFF on the same page', async () => {
    // The transition, on one mounted instance rather than two renders: a cached listing from the permitted
    // state must not keep a resale buyable after it is revoked.
    secondary.purchases = true
    fetchUnifiedListingForItem.mockResolvedValue(nativeResaleRow())

    const { rerender } = renderAt(`/item/${CONTRACT}/1`, '/item/:contractAddress/:itemId', {
      item: seededResale()
    })
    await screen.findByRole('heading', { name: /Ruby Red Fascinator/ })
    await waitFor(() => expect(buyNow()).toBeInTheDocument(), { timeout: 2000 })

    secondary.purchases = false
    fetchUnifiedListingForItem.mockResolvedValue(null)
    rerender(tree(`/item/${CONTRACT}/1`, '/item/:contractAddress/:itemId', { item: seededResale() }))

    await waitFor(() => expect(buyNow()).not.toBeInTheDocument(), { timeout: 3000 })
  })
})

/**
 * THE COMPOSITION: a resale that IS the item's only listing, with resales on sale.
 *
 * Asserting the HTTP parameter is not enough — the row that comes back has to reach the purchase path
 * carrying its token, because the buy path verifies the signed trade against the row's identity and
 * refuses a resale's trade on an item-shaped row. Hydration copied `tradeId` and not `tokenId`, so this
 * combination would have been resolved as unbuyable. A `resolveLine` test with a stubbed resolver cannot
 * see that: it is the projection that was wrong, not the resolver.
 */
describe('ItemDetail — an item whose only listing is a resale, with resales on sale', () => {
  it('should carry the token through to the buy projection', async () => {
    secondary.purchases = true
    fetchUnifiedListingForItem.mockResolvedValue(nativeResaleRow())
    // The cart store is a module singleton backed by localStorage, so it carries whatever a previous file
    // in the same worker left behind. Start from empty or this asserts on someone else's line.
    useCart.setState({ items: [], open: false })

    renderItemPage()

    await screen.findByRole('heading', { name: /Ruby Red Fascinator/ })
    await waitFor(() => expect(buyNow()).toBeInTheDocument(), { timeout: 2000 })

    // The identity the purchase will be verified against. Read off the cart, which takes the same
    // projection the buy modal does.
    await userEvent.click(screen.getByRole('button', { name: /add to cart/i }))
    await waitFor(() => expect(useCart.getState().items).toHaveLength(1))
    const line = useCart.getState().items.find(i => i.tradeId === 'resale-trade-1')
    expect(line).toMatchObject({ tokenId: TOKEN_ID, tradeId: 'resale-trade-1' })
  })
})
