import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'

/**
 * REMOVE FROM SALE, AS THE PAGE SEES IT.
 *
 * The take-down is only half a feature: once the cancel confirms, THIS page has to stop offering the listing.
 * Nothing in the react-query layer can retire it on the /item route — the listing lives in the page's own
 * `current.tradeId` (seeded from the grid row that opened the page), and the feed's materialized view keeps
 * handing the same, now-dead trade back for a moment afterwards. So every test here leaves the feed lying and
 * asserts on the rendered page: the listed price and the Remove CTA must give way to the unlisted CTA anyway.
 */

// ItemDetail pulls checkout, the builder client and the wallet transitively, and those reach
// decentraland-transactions' ESM directory imports that vitest's node resolver cannot follow (same
// workaround as ItemDetail.spec.tsx). Nothing here touches a contract.
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
const CREATOR = '0xabc0000000000000000000000000000000000abc'
const LIVE_TRADE = 'trade-1'

const session = {
  address: CREATOR,
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
// `useWallet` is called both as a hook and (by lib/analytics) as `useWallet.getState()`.
vi.mock('~/store/wallet', () => ({
  useWallet: Object.assign((sel?: (s: typeof walletState) => unknown) => (sel ? sel(walletState) : walletState), {
    getState: () => walletState
  })
}))

// Keep the real analytics helpers — isOwnListing reads isPrimaryItem from here — and silence the wire only.
vi.mock('~/lib/analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/analytics')>()),
  track: vi.fn()
}))

const { fetchShopListingForItem, fetchTradeForItem, fetchTrade } = vi.hoisted(() => ({
  fetchShopListingForItem: vi.fn(),
  fetchTradeForItem: vi.fn(),
  fetchTrade: vi.fn()
}))
vi.mock('~/lib/api', () => ({
  fetchShopListingForItem,
  fetchTradeForItem,
  fetchTrade,
  fetchItemResales: vi.fn().mockResolvedValue([]),
  fetchItemDescription: vi.fn().mockResolvedValue(''),
  fetchOwnedToken: vi.fn().mockResolvedValue(null),
  fetchOwnedItemCount: vi.fn().mockResolvedValue(0),
  fetchTokenById: vi.fn().mockResolvedValue(null),
  usdWeiToCents: () => 0
}))

const { cancelListing } = vi.hoisted(() => ({ cancelListing: vi.fn() }))
vi.mock('~/lib/buy', () => ({ cancelListing }))

vi.mock('~/lib/collections', () => ({
  fetchCollectionItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchCollection: vi.fn().mockResolvedValue({
    contractAddress: '0xanchor',
    name: 'Solo Collection',
    creator: '0xabc0000000000000000000000000000000000abc'
  })
}))
vi.mock('~/lib/builder', () => ({ fetchPublishableItems: vi.fn().mockResolvedValue([]) }))
vi.mock('~/hooks/useRelatedItems', () => ({ useRelatedItems: () => ({ items: [], isFetched: true }) }))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined, isError: false }) }))
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => false }))

import { ItemDetail } from '~/pages/ItemDetail'

// The creator's own primary (mint) listing, in the shape a grid row hands over in router state.
function listedItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: LIVE_TRADE,
    name: 'Anchor Hat',
    creator: CREATOR,
    contractAddress: CONTRACT,
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
    available: 5,
    tradeId: LIVE_TRADE,
    ...overrides
  }
}

function renderPdp(qc: QueryClient, item = listedItem()) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[{ pathname: `/item/${CONTRACT}/1`, state: { item, tradeId: item.tradeId } }]}>
        <Routes>
          <Route path="/item/:contractAddress/:itemId" element={<ItemDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
const removeCta = () => screen.getByRole('button', { name: /remove from sale/i })
const listCta = () => screen.queryByRole('button', { name: /put up for sale/i })

beforeEach(() => {
  vi.clearAllMocks()
  fetchTrade.mockResolvedValue({ id: LIVE_TRADE, signer: CREATOR })
  cancelListing.mockResolvedValue('0xhash')
  // The eventually-consistent feed, still reporting the listing after the cancel confirmed.
  fetchShopListingForItem.mockResolvedValue(listedItem())
  fetchTradeForItem.mockResolvedValue({ id: LIVE_TRADE })
})

describe('ItemDetail — taking your own listing down from the item page', () => {
  it('should stop offering the listing as soon as the take-down confirms', async () => {
    renderPdp(newClient())

    // The state the report came from: the creator's listed item, price shown, Remove offered.
    expect(await screen.findByTestId('item-price')).toHaveTextContent('10')
    await userEvent.click(removeCta())

    await waitFor(() => expect(listCta()).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /remove from sale/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('item-price')).not.toBeInTheDocument()
  })

  it('and the page is reopened before the feed catches up, should still show it as unlisted', async () => {
    const qc = newClient()
    const { unmount } = renderPdp(qc)

    expect(await screen.findByTestId('item-price')).toHaveTextContent('10')
    await userEvent.click(removeCta())
    await waitFor(() => expect(listCta()).toBeInTheDocument())
    unmount()

    // Re-entry from a grid whose rows still predate the cancellation: same app session, same stale seed.
    renderPdp(qc)

    await waitFor(() => expect(listCta()).toBeInTheDocument())
    expect(screen.queryByTestId('item-price')).not.toBeInTheDocument()
  })

  it('should keep offering the listing when the take-down fails', async () => {
    cancelListing.mockRejectedValue(new Error('nope'))
    renderPdp(newClient())

    expect(await screen.findByTestId('item-price')).toHaveTextContent('10')
    await userEvent.click(removeCta())

    await waitFor(() => expect(screen.getByRole('button', { name: /remove from sale/i })).toBeEnabled())
    expect(listCta()).not.toBeInTheDocument()
    expect(screen.getByTestId('item-price')).toHaveTextContent('10')
  })
})
