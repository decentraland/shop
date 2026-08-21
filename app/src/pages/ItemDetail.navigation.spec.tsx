import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'

/**
 * ARRIVING AT A TOKEN PAGE FROM AN ITEM PAGE.
 *
 * `/item/:contractAddress/:itemId` and `/token/:contractAddress/:tokenId` are two routes rendering ONE
 * component, so react-router swaps the params on the SAME mounted instance — the seeding `useState` never
 * runs again. The page's identity therefore has to be re-derived from the route, or the second page is
 * rendered with the first one's identity.
 *
 * The reported symptom was the expensive half of that: a token the viewer OWNS rendered as "Not for sale"
 * with a Notify-me box, because the owned-token lookup was gated on a `current.tokenId` that the item route
 * had pinned to `undefined`. A hard reload of the very same URL showed the owner view, which is what makes
 * this look like a caching problem rather than a mount-order one.
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
const TOKEN_ID = '70'
const ITEM_ID = '1'

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

const { fetchOwnedToken, fetchShopListingForItem } = vi.hoisted(() => ({
  fetchOwnedToken: vi.fn(),
  fetchShopListingForItem: vi.fn()
}))
vi.mock('~/lib/api', () => ({
  fetchOwnedToken,
  fetchShopListingForItem,
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
  issuedId: TOKEN_ID,
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

function renderApp(initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[{ pathname: initialPath, state: { item: unlistedItem } }]}>
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
  // ever be called with '70' — and a call with anything else means the page asked about the wrong thing.
  fetchOwnedToken.mockImplementation(async (_owner: string, _contract: string, tokenId: string) =>
    tokenId === TOKEN_ID ? ownedToken : null
  )
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

describe('when the viewer opens their own token page directly', () => {
  // The control. This path always worked — the seeding state runs on mount with the token route matched —
  // and it is what made the bug look like a cache problem: same URL, different outcome.
  it('should show the owner actions', async () => {
    renderApp(`/token/${CONTRACT}/${TOKEN_ID}`)

    await waitFor(() => expect(transferCta()).toBeInTheDocument())
  }, 30000)
})
