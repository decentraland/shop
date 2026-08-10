import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'

/**
 * A COLLECTION-STORE MINT REACHED FROM A GRID.
 *
 * A mint has no trade, so `acquisition: 'store'` is the only thing that makes it for sale — and the
 * /v3/catalog/items feeds (collection page, creator storefront, suggestion rails, Recently viewed) cannot
 * tell a mint from a classic order, so they omit that field. Their cards still carry stock, which used to
 * be enough for the page to skip the authoritative read: reported on production, clicking such a card
 * landed on "Not for sale" beside "61/100" in stock, for an item the same grid was selling at 24 credits.
 */

// Same transitive-ESM workaround as the other ItemDetail specs — nothing here touches a contract.
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

const CONTRACT = '0x08de0de733cc11081d43569b809c00e6ddf314fb'
const CREATOR = '0x1dec5f50cb1467f505bb3ddfd408805114406b10'

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

const { fetchUnifiedListingForItem, fetchTradeForItem, fetchItemMeta } = vi.hoisted(() => ({
  fetchUnifiedListingForItem: vi.fn(),
  fetchTradeForItem: vi.fn(),
  fetchItemMeta: vi.fn()
}))
vi.mock('~/lib/api', () => ({
  fetchUnifiedListingForItem,
  fetchShopListingForItem: fetchUnifiedListingForItem,
  fetchTradeForItem,
  fetchTrade: vi.fn().mockResolvedValue(null),
  fetchItemMeta,
  fetchItemResales: vi.fn().mockResolvedValue([]),
  fetchItemDescription: vi.fn().mockResolvedValue(''),
  fetchOwnedToken: vi.fn().mockResolvedValue(null),
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
    contractAddress: '0x08de0de733cc11081d43569b809c00e6ddf314fb',
    name: 'Puuurs',
    creator: '0x1dec5f50cb1467f505bb3ddfd408805114406b10'
  })
}))
const { fetchItemVideoUrl, fetchVrmExportBlocked } = vi.hoisted(() => ({
  fetchItemVideoUrl: vi.fn(),
  fetchVrmExportBlocked: vi.fn()
}))
vi.mock('~/lib/wearable-rules', () => ({ fetchVrmExportBlocked }))
vi.mock('~/lib/builder', () => ({ fetchPublishableItems: vi.fn().mockResolvedValue([]), fetchItemVideoUrl }))
vi.mock('~/hooks/useRelatedItems', () => ({ useRelatedItems: () => ({ items: [], isFetched: true }) }))
// $0.068 per MANA at 8 decimals: the rate that prices the 35-MANA mint at the 24 credits its card showed.
vi.mock('~/hooks/useManaRate', () => ({
  useManaRate: () => ({ data: { rate: 6_800_000n, decimals: 8 }, isError: false, isPending: false })
}))
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => false }))

import { ItemDetail } from '~/pages/ItemDetail'

const MANA_35 = '35000000000000000000'

// The mint as the UNIFIED feed reports it: no trade, MANA-priced, and flagged as a store acquisition.
const mintListing = {
  id: `${CONTRACT}-1`,
  name: 'Puuurs Slides Leopard',
  creator: CREATOR,
  contractAddress: CONTRACT,
  itemId: '1',
  category: 'wearable',
  wearableCategory: 'feet',
  rarity: 'legendary',
  network: 'MATIC',
  chainId: 137,
  thumbnail: '',
  priceCredits: 23,
  gender: 'unisex',
  isSmart: false,
  available: 61,
  tradeId: undefined,
  source: 'legacy',
  acquisition: 'store',
  manaWei: MANA_35
} as CatalogItem

// The same mint as a /v3/catalog/items CARD hands it over in router state: stock and a MANA price, but no
// tradeId and — deliberately, that feed cannot tell — no `acquisition`.
const gridCard = {
  id: `${CONTRACT}-1`,
  name: 'Puuurs Slides Leopard',
  creator: CREATOR,
  contractAddress: CONTRACT,
  itemId: '1',
  urn: `urn:decentraland:matic:collections-v2:${CONTRACT}:1`,
  category: 'wearable',
  wearableCategory: 'feet',
  rarity: 'legendary',
  network: 'MATIC',
  chainId: 137,
  thumbnail: '',
  priceCredits: 24,
  gender: 'unisex',
  isSmart: false,
  available: 61,
  manaWei: MANA_35
} as CatalogItem

function renderFromGrid(item: CatalogItem) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[{ pathname: `/item/${CONTRACT}/1`, state: { item, tradeId: item.tradeId } }]}>
        <Routes>
          <Route path="/item/:contractAddress/:itemId" element={<ItemDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchUnifiedListingForItem.mockResolvedValue(mintListing)
  // A mint has no trade to resolve — which is exactly why `acquisition` has to arrive.
  fetchTradeForItem.mockResolvedValue(null)
  fetchItemMeta.mockResolvedValue(null)
  fetchItemVideoUrl.mockResolvedValue(null)
  fetchVrmExportBlocked.mockResolvedValue(false)
})

describe('ItemDetail — a store mint reached from a card that cannot say it is one', () => {
  it('should read the authoritative listing and offer the mint for sale', async () => {
    renderFromGrid(gridCard)

    // 24, not the 23 the feed reports: a mint is MANA-priced, so the live rate prices it (see
    // ItemDetail.price.spec) — and the hydrated snapshot must not undo that on its way in.
    await waitFor(() => expect(screen.getByTestId('item-price')).toHaveTextContent('24'))
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeEnabled()
    expect(screen.queryByText(/not for sale/i)).not.toBeInTheDocument()
  })

  it('should keep the fields the unified feed does not report', async () => {
    renderFromGrid(gridCard)

    await waitFor(() => expect(screen.getByTestId('item-price')).toHaveTextContent('24'))
    // The stock is the listing's, not the card's stale copy.
    // 61/100: 61 available from mintListing, 100 = Rarity.getMaxSupply('legendary') from @dcl/schemas.
    expect(screen.getByText('61/100')).toBeInTheDocument()
  })

  /**
   * This asserted the OPPOSITE until #316: a card carrying both facts used to skip the read, to save a
   * request the page seemed not to need.
   *
   * It needs it. Price and `tradeId` on a seeded card are a snapshot of the grid that linked here, and the
   * trade they name may already be cancelled or repriced — leaving a stale figure on screen with a Buy
   * button under it. Saving one request is not worth quoting someone a price that is no longer real, so
   * the read is now unconditional on the item route and this pins that.
   */
  it('should re-read the listing even when the card already carries both facts', async () => {
    renderFromGrid({ ...gridCard, tradeId: 'trade-1', acquisition: 'trade' })

    await waitFor(() => expect(fetchUnifiedListingForItem).toHaveBeenCalled())
  })
})
