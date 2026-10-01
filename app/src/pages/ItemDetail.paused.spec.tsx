import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'
import { t } from '~/intl/i18n'

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

const { fetchShopListingForItem, fetchTradeForItem, fetchTrade, fetchItemMeta, fetchItemResales } = vi.hoisted(() => ({
  fetchShopListingForItem: vi.fn(),
  fetchTradeForItem: vi.fn(),
  fetchTrade: vi.fn(),
  fetchItemMeta: vi.fn(),
  fetchItemResales: vi.fn()
}))
vi.mock('~/lib/api', () => ({
  fetchShopListingForItem,
  fetchUnifiedListingForItem: fetchShopListingForItem,
  fetchTradeForItem,
  fetchTrade,
  fetchItemMeta,
  fetchItemResales,
  fetchItemDescription: vi.fn().mockResolvedValue(''),
  fetchOwnedToken: vi.fn().mockResolvedValue(null),
  fetchOwnedItemCount: vi.fn().mockResolvedValue(0),
  fetchTokenById: vi.fn().mockResolvedValue(null),
  usdWeiToCents: () => 0
}))

const { cancelListing } = vi.hoisted(() => ({ cancelListing: vi.fn() }))
vi.mock('~/lib/buy', () => ({
  cancelListing,
  // The page narrows on this class to tell "the relay did not confirm" apart from a real failure.
  GaslessCancelFailedError: class GaslessCancelFailedError extends Error {}
}))

vi.mock('~/lib/collections', () => ({
  fetchCollectionItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchCatalogItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchCollection: vi.fn().mockResolvedValue({
    contractAddress: '0xanchor',
    name: 'Solo Collection',
    creator: '0xabc0000000000000000000000000000000000abc'
  })
}))
const { fetchItemVideoUrl, fetchVrmExportBlocked } = vi.hoisted(() => ({
  fetchItemVideoUrl: vi.fn(),
  fetchVrmExportBlocked: vi.fn()
}))
vi.mock('~/lib/wearable-rules', () => ({ fetchVrmExportBlocked }))
vi.mock('~/lib/builder', () => ({ fetchPublishableItems: vi.fn().mockResolvedValue([]), fetchItemVideoUrl }))
vi.mock('~/hooks/useRelatedItems', () => ({ useRelatedItems: () => ({ items: [], isFetched: true }) }))
const { manaRate } = vi.hoisted(() => ({
  manaRate: { value: undefined as { rate: bigint; decimals: number } | undefined }
}))
vi.mock('~/hooks/useManaRate', () => ({
  useManaRate: () => ({ data: manaRate.value, isError: false, isPending: manaRate.value === undefined })
}))
const { secondarySales } = vi.hoisted(() => ({ secondarySales: { value: false } }))
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => secondarySales.value }))
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: { name: 'reseller' } }) }))
// The modal's own flow is covered by its spec; here it only reports which listing it was opened for.
vi.mock('~/components/BuyModal', () => ({
  BuyModal: ({ item }: { item: CatalogItem }) => <div data-testid="buy-modal" data-trade={item.tradeId} />
}))

import { ItemDetail } from '~/pages/ItemDetail'

const OTHER = '0xother0000000000000000000000000000000other'

function listing(over: Partial<CatalogItem> = {}) {
  return {
    id: 'paused-trade',
    name: 'Laser Face',
    creator: OTHER,
    contractAddress: CONTRACT,
    itemId: '2',
    category: 'wearable',
    wearableCategory: 'hat',
    rarity: 'epic',
    network: 'MATIC',
    chainId: 80002,
    thumbnail: '',
    priceCredits: 42,
    gender: null,
    isSmart: false,
    available: 10,
    tradeId: 'paused-trade',
    source: 'native',
    acquisition: 'trade',
    manaWei: null,
    paused: true,
    ...over
  } as CatalogItem
}

function renderCold() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/item/${CONTRACT}/2`]}>
        <Routes>
          <Route path="/item/:contractAddress/:itemId" element={<ItemDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderSeeded(seed: CatalogItem) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[{ pathname: `/item/${CONTRACT}/2`, state: { item: seed } }]}>
        <Routes>
          <Route path="/item/:contractAddress/:itemId" element={<ItemDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  manaRate.value = undefined
  secondarySales.value = false
  fetchItemResales.mockResolvedValue([])
  fetchTrade.mockResolvedValue({ id: 'paused-trade', signer: OTHER, paused: true })
  fetchTradeForItem.mockResolvedValue({ id: 'paused-trade', paused: true })
  fetchItemMeta.mockResolvedValue(null)
  fetchItemVideoUrl.mockResolvedValue(null)
  fetchVrmExportBlocked.mockResolvedValue(false)
})

describe('when a buyer opens an item whose listing is paused', () => {
  beforeEach(async () => {
    fetchShopListingForItem.mockResolvedValue(listing())
    renderCold()
    await screen.findByTestId('paused-notice')
  })

  it('should keep showing the price', () => {
    expect(screen.getByTestId('item-price').textContent).toContain('42')
  })

  it('should explain why the item cannot be bought', () => {
    expect(screen.getByTestId('paused-notice').textContent).toBe(t('itemDetail.pausedHint'))
  })

  it('should disable Buy now', () => {
    expect(screen.getByTestId('detail-buy-now')).toBeDisabled()
  })

  it('should disable Add to cart', () => {
    expect(screen.getByTestId('detail-add-cart')).toBeDisabled()
  })
})

describe('when a buyer opens an item whose listing is live', () => {
  beforeEach(async () => {
    fetchShopListingForItem.mockResolvedValue(listing({ paused: false }))
    fetchTradeForItem.mockResolvedValue({ id: 'paused-trade', paused: false })
    renderCold()
    await waitFor(() => expect(screen.getByTestId('detail-buy-now')).not.toBeDisabled())
  })

  it('should show no paused notice', () => {
    expect(screen.queryByTestId('paused-notice')).not.toBeInTheDocument()
  })
})

describe('when the creator opens their own paused listing', () => {
  beforeEach(async () => {
    fetchShopListingForItem.mockResolvedValue(listing({ creator: CREATOR }))
    fetchTrade.mockResolvedValue({ id: 'paused-trade', signer: CREATOR, paused: true })
    renderCold()
    await screen.findByTestId('paused-notice')
  })

  it('should suggest listing it again', () => {
    expect(screen.getByTestId('paused-notice').textContent).toBe(t('itemDetail.pausedSellerHint'))
  })

  it('should still offer to remove the listing', () => {
    expect(screen.getByTestId('remove-listing')).toBeInTheDocument()
  })

  it('should offer to list it again instead of editing the price', () => {
    expect(screen.getByTestId('edit-price').textContent).toBe(t('itemDetail.manageRelist'))
  })
})

const RESELLER = '0xres00000000000000000000000000000000000res'

function resale(over: Partial<CatalogItem> = {}) {
  return listing({
    id: 'resale-trade',
    tradeId: 'resale-trade',
    tokenId: '9',
    seller: RESELLER,
    priceCredits: 55,
    paused: false,
    ...over
  })
}

describe("when a buyer opens an item whose creator's listing is paused and a resale is live", () => {
  beforeEach(async () => {
    secondarySales.value = true
    fetchShopListingForItem.mockResolvedValue(listing())
    fetchItemResales.mockResolvedValue([resale()])
    renderCold()
    await screen.findByTestId('paused-resale')
  })

  it('should show the resale price as the offer', () => {
    expect(screen.getByTestId('resale-offer-price').textContent).toContain('55')
  })

  it('should name the reseller', () => {
    expect(screen.getByTestId('resale-offer-seller').textContent).toBe(
      t('itemDetail.resaleSeller', { name: 'Reseller' })
    )
  })

  it("should mark the creator's listing as on hold", () => {
    expect(screen.getByTestId('item-paused').textContent).toBe(t('itemDetail.paused'))
  })

  it('should explain that the offer is a resale', () => {
    expect(screen.getByTestId('paused-resale-notice').textContent).toBe(t('itemDetail.pausedResaleHint'))
  })

  it('should not offer to buy from the creator', () => {
    expect(screen.queryByTestId('buy-from-creator')).not.toBeInTheDocument()
  })

  it('should price Buy now at the resale', () => {
    expect(screen.getByTestId('resale-buy-now').textContent).toContain('55')
  })

  it("should not offer the paused listing's Buy now", () => {
    expect(screen.queryByTestId('detail-buy-now')).not.toBeInTheDocument()
  })

  describe('and the buyer clicks Buy now', () => {
    beforeEach(async () => {
      await userEvent.click(screen.getByTestId('resale-buy-now'))
    })

    it('should open checkout for the resale', () => {
      expect(screen.getByTestId('buy-modal')).toHaveAttribute('data-trade', 'resale-trade')
    })
  })
})

describe("when a buyer opens an item whose creator's listing and every resale are paused", () => {
  beforeEach(async () => {
    secondarySales.value = true
    fetchShopListingForItem.mockResolvedValue(listing())
    fetchItemResales.mockResolvedValue([resale({ paused: true })])
    renderCold()
    await screen.findByTestId('paused-notice')
  })

  it('should keep Buy now disabled', () => {
    expect(screen.getByTestId('detail-buy-now')).toBeDisabled()
  })

  it('should not present a resale offer', () => {
    expect(screen.queryByTestId('paused-resale')).not.toBeInTheDocument()
  })
})

describe('when the page opens from a paused card but the creator has listed again', () => {
  beforeEach(async () => {
    fetchShopListingForItem.mockResolvedValue(listing({ id: 'new-trade', tradeId: 'new-trade', paused: false }))
    renderSeeded(listing())
    await waitFor(() => expect(screen.getByTestId('detail-buy-now')).not.toBeDisabled())
  })

  it('should show no paused notice', () => {
    expect(screen.queryByTestId('paused-notice')).not.toBeInTheDocument()
  })
})
