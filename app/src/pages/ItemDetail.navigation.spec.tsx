import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'

/**
 * ARRIVING AT A TOKEN PAGE HAVING SEEN THE ITEM PAGE.
 *
 * One symptom, TWO independent mechanisms — a token the viewer OWNS rendered as the buyer view, "Not for
 * sale" with a notify-me box and a STOCK count. Both leave the page on the token route holding an identity
 * with no tokenId, which is what disables the owned-token lookup the owner actions depend on:
 *
 *  1. THE MOUNT. Both routes render ONE component, so react-router swaps the params on the SAME mounted
 *     instance while the page seeds its identity in a `useState` initialiser that never runs again. Fixed
 *     by keying the page on the path (ItemDetailRoute).
 *
 *  2. THE CACHE. The generic item listing is keyed on the itemId, and on the token route that id is DECODED
 *     from the token — the same key. `enabled: false` stops the fetch but NOT the cache read, so having
 *     opened the item page first left its row (no tokenId, with the mint's stock) there to be adopted.
 *
 * The second one is why a hard reload of the same URL was fine, and why this looked like a stale cache: it
 * WAS one. The first is why it also happened with an empty cache.
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
const OWNER = '0xabc0000000000000000000000000000000000abc'
// From the report. The itemId is DECODED from the token (4), which is what makes the item page's cache
// entry and the token page's cache key the same entry — the collision this file exists to pin.
const TOKEN_ID = '421249166674228746791672110734681729275580381602196445017243910157'
const ITEM_ID = '4'
const ISSUED_ID = '13'

const session = {
  address: OWNER,
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: {} as never,
  providerType: 'injected' as never
}
const walletState = {
  session,
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

const { fetchOwnedToken, fetchShopListingForItem, fetchItemMeta, fetchUnifiedListingForItem } = vi.hoisted(() => ({
  fetchOwnedToken: vi.fn(),
  fetchShopListingForItem: vi.fn(),
  fetchItemMeta: vi.fn(),
  fetchUnifiedListingForItem: vi.fn()
}))
vi.mock('~/lib/api', () => ({
  fetchOwnedToken,
  fetchShopListingForItem,
  fetchItemMeta,
  fetchUnifiedListingForItem,
  fetchTradeForItem: vi.fn().mockResolvedValue(null),
  fetchTrade: vi.fn().mockResolvedValue(null),
  fetchItemResales: vi.fn().mockResolvedValue([]),
  fetchItemDescription: vi.fn().mockResolvedValue(''),
  fetchOwnedItemCount: vi.fn().mockResolvedValue(0),
  fetchTokenById: vi.fn().mockResolvedValue(null),
  usdWeiToCents: () => 0
}))

vi.mock('~/lib/buy', () => ({
  cancelListing: vi.fn(),
  GaslessCancelFailedError: class GaslessCancelFailedError extends Error {}
}))

vi.mock('~/lib/collections', () => ({
  fetchCollectionItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchCatalogItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchCollection: vi.fn().mockResolvedValue({
    contractAddress: '0xanchor',
    name: 'Global Vibes',
    creator: '0xdeadbeef00000000000000000000000000000000'
  })
}))
vi.mock('~/lib/builder', () => ({ fetchPublishableItems: vi.fn().mockResolvedValue([]) }))
vi.mock('~/hooks/useRelatedItems', () => ({ useRelatedItems: () => ({ items: [], isFetched: true }) }))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined, isError: false }) }))
// Secondary sales OFF, deliberately: ownership alone decides the manage surface, so TRANSFER has to be
// there with the selling CTAs gone. This is the configuration the report came from.
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => false }))

import { ItemDetailRoute } from '~/pages/ItemDetail'

// The generic item, as a grid row hands it over in router state — no tokenId, not for sale.
const unlistedItem: CatalogItem = {
  id: `${CONTRACT}-${ITEM_ID}`,
  name: 'Global Vibes',
  creator: '0xdeadbeef00000000000000000000000000000000',
  contractAddress: CONTRACT,
  itemId: ITEM_ID,
  category: 'wearable',
  wearableCategory: 'upper_body',
  rarity: 'legendary',
  network: 'MATIC',
  chainId: 80002,
  thumbnail: '',
  priceCredits: 0,
  gender: 'unisex',
  isSmart: false,
  available: 0
}

// The viewer's own copy, as the owned-tokens lookup reports it: held, not listed.
const ownedToken = {
  id: `${CONTRACT}-${TOKEN_ID}`,
  contractAddress: CONTRACT,
  tokenId: TOKEN_ID,
  issuedId: ISSUED_ID,
  itemId: ITEM_ID,
  name: 'Global Vibes Shorts',
  category: 'wearable',
  image: '',
  rarity: 'legendary',
  network: 'MATIC',
  chainId: 80002,
  isOnSale: false,
  listingPrice: undefined,
  tradeId: undefined
}

/** The MANAGE affordance: a plain navigation to the token route, which is all My Items does. */
function ToTokenPage() {
  const navigate = useNavigate()
  return <button onClick={() => navigate(`/token/${CONTRACT}/${TOKEN_ID}`)}>go to token</button>
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

/**
 * @param withState  Whether the entry carries a grid row in router state, as a click from a grid does.
 *                   `false` is a DEEP LINK or a refresh: the page starts from its own stub, so every field
 *                   has to be resolved. A seeded row already carries the slot and the body shapes, and a
 *                   test that always seeds one cannot see whether the page can find them on its own.
 * @param qc         Pass an existing client to keep a WARM cache across two renders — which is the only way
 *                   to reproduce a second page adopting what the first one stored.
 */
function renderApp(initialPath: string, withState = true, qc: QueryClient = newClient()) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[{ pathname: initialPath, state: withState ? { item: unlistedItem } : null }]}>
        <ToTokenPage />
        <Routes>
          <Route path="/item/:contractAddress/:itemId" element={<ItemDetailRoute />} />
          <Route path="/token/:contractAddress/:tokenId" element={<ItemDetailRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const transferCta = () => screen.queryByRole('button', { name: /^transfer$/i })
const notifyCta = () => screen.queryByRole('button', { name: /^notify me$/i })

beforeEach(() => {
  vi.clearAllMocks()
  fetchShopListingForItem.mockResolvedValue(null)
  // Owned only as THIS token. The item route asks for no token, so a lookup keyed on the route can only
  // ever be called with the reported id — a call with anything else means the page asked about the wrong
  // thing.
  fetchOwnedToken.mockImplementation(async (_owner: string, _contract: string, tokenId: string) =>
    tokenId === TOKEN_ID ? ownedToken : null
  )
  // The item row: the ONLY source of the slot and the body shapes. Deliberately unlike `ownedToken`, which
  // reports neither — that asymmetry is the whole point of the backfill.
  fetchUnifiedListingForItem.mockResolvedValue({
    ...unlistedItem,
    tokenId: undefined,
    available: 83
  })
  fetchItemMeta.mockResolvedValue({
    name: 'Global Vibes Shorts',
    thumbnail: '',
    isSmart: false,
    utility: null,
    urn: null,
    wearableCategory: 'upper_body',
    gender: 'unisex'
  })
})

describe('when the viewer reaches their own token page from the generic item page', () => {
  it('should show the owner actions rather than the buyer view', async () => {
    renderApp(`/item/${CONTRACT}/${ITEM_ID}`)

    // The item page first: the generic buy view, nothing owner-ish about it.
    await waitFor(() => expect(notifyCta()).toBeInTheDocument())
    expect(transferCta()).not.toBeInTheDocument()

    // Then MANAGE, which is only ever a navigation.
    await userEvent.click(screen.getByRole('button', { name: /go to token/i }))

    await waitFor(() => expect(transferCta()).toBeInTheDocument())
  }, 30000)

  it('should look up the token the ROUTE names, not the one the previous page left behind', async () => {
    renderApp(`/item/${CONTRACT}/${ITEM_ID}`)
    await waitFor(() => expect(notifyCta()).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /go to token/i }))
    await waitFor(() => expect(fetchOwnedToken).toHaveBeenCalled())

    // Every ownership lookup this page makes is about token 70. Before the fix there were NONE — the
    // query stayed disabled on an undefined token id — so asserting the argument also asserts it ran.
    for (const call of fetchOwnedToken.mock.calls) {
      expect(call[2]).toBe(TOKEN_ID)
    }
  }, 30000)

  it('should stop offering to notify the viewer about an item already in their wallet', async () => {
    renderApp(`/item/${CONTRACT}/${ITEM_ID}`)
    await waitFor(() => expect(notifyCta()).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /go to token/i }))
    await waitFor(() => expect(transferCta()).toBeInTheDocument())

    // The reported screenshot: "Not for sale" + a notify-me box, on the viewer's own token.
    expect(notifyCta()).not.toBeInTheDocument()
  }, 30000)
})

/**
 * MECHANISM 2, on its own: the page MOUNTS fresh on the token route, and still adopts the item row.
 *
 * This is the path from the report — item page, away to My Items, then open the token — where the trip
 * through another route unmounts the page, so nothing about the mount can explain it. What survives that
 * trip is the QUERY CACHE, and the item listing's key is the decoded itemId: the same entry either route
 * resolves to. Reading it on the token route replaces the identity with a row that has no tokenId.
 *
 * `STOCK` is the assertion rather than the absent TRANSFER, because it names the cause: that count is the
 * MINT's remaining supply and it can only render when the page believes it has no token in hand.
 */
describe('when the viewer opened the item page earlier in the session', () => {
  it('should not adopt the generic item row on the token page', async () => {
    const qc = newClient()

    // Fill the cache exactly as the item page does, through the page itself.
    const first = renderApp(`/item/${CONTRACT}/${ITEM_ID}`, true, qc)
    await waitFor(() => expect(notifyCta()).toBeInTheDocument())
    await waitFor(() => expect(fetchUnifiedListingForItem).toHaveBeenCalled())
    first.unmount()

    // Now the token page, mounted fresh — but against a warm cache, on the same client the app uses.
    renderApp(`/token/${CONTRACT}/${TOKEN_ID}`, false, qc)

    await waitFor(() => expect(transferCta()).toBeInTheDocument())
    expect(screen.queryByText(/^stock$/i)).not.toBeInTheDocument()
    expect(notifyCta()).not.toBeInTheDocument()
  }, 30000)
})

/**
 * The owner's row on a token page: TRANSFER, and RESELL ITEM under it (Figma 1526:300789).
 *
 * Reselling is not built in the Shop yet, so the second one is a hand-off to the legacy Marketplace. It is
 * on THIS page rather than in My Items because a token page is where an owner arrives to decide what to do
 * with one specific copy.
 */
describe('when the viewer owns the token on the page', () => {
  it('should offer to resell it, and hand off with that exact token', async () => {
    renderApp(`/token/${CONTRACT}/${TOKEN_ID}`, false)
    await waitFor(() => expect(transferCta()).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('resell-item'))

    expect(screen.getByTestId('marketplace-redirect-modal')).toBeInTheDocument()
    // The id in the hand-off URL comes from the ROUTE, so it is the copy the owner was looking at.
    expect(screen.getByTestId('marketplace-redirect-continue').getAttribute('href')).toContain(
      `/contracts/${CONTRACT}/tokens/${TOKEN_ID}`
    )
  }, 30000)

  // A viewer who does not hold the token has nothing to resell, so the link must not be there at all —
  // it would hand them to a marketplace page for someone else's asset.
  it('should not offer to resell a token the viewer does not own', async () => {
    fetchOwnedToken.mockResolvedValue(null)

    renderApp(`/token/${CONTRACT}/${TOKEN_ID}`, false)

    await waitFor(() => expect(fetchOwnedToken).toHaveBeenCalled())
    expect(screen.queryByTestId('resell-item')).not.toBeInTheDocument()
  }, 30000)
})

describe('when the viewer opens their own token page directly', () => {
  // The control. This path always worked — the seeding state runs on mount with the token route matched —
  // and it is what made the bug look like a cache problem: same URL, different outcome.
  it('should show the owner actions', async () => {
    renderApp(`/token/${CONTRACT}/${TOKEN_ID}`)

    await waitFor(() => expect(transferCta()).toBeInTheDocument())
  }, 30000)

  /**
   * The chip row, per the design (Figma 1527:301129): rarity, the SLOT, and who can wear it.
   *
   * A token page hydrates from the owned-token lookup, which carries the token's `category` ('wearable')
   * but neither its slot nor its body shapes. So this row degraded to "LEGENDARY · WEARABLE" with no gender
   * chip at all, while the same asset's item page showed the slot and the gender. Same asset, two chip rows.
   */
  it('should show the slot and the gender chips, not the generic category', async () => {
    // NO router state: the owned-token lookup and the item row are the only sources, which is the case the
    // backfill exists for. Seeded from a grid row the page already has both and proves nothing.
    renderApp(`/token/${CONTRACT}/${TOKEN_ID}`, false)

    // Lower-case in the DOM; the uppercasing is CSS.
    await waitFor(() => expect(screen.getByText(/upper body/i)).toBeInTheDocument())
    expect(screen.getByText(/unisex/i)).toBeInTheDocument()
    // The generic fallback must be gone, not merely joined by the specific one.
    expect(screen.queryByText(/^wearable$/i)).not.toBeInTheDocument()
  }, 30000)
})
