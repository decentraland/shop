import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'

/**
 * WHAT A MANA-PRICED ITEM COSTS, ON ITS OWN PAGE.
 *
 * The unified feed reports a `priceCredits` for legacy (MANA) rows and it is NOT what the buyer pays: seen on
 * production, a 25-MANA emote came back as 5 credits while the live oracle made it 17, and 17 is what checkout
 * authorizes. The browse grid has always converted client-side, so the same item read 17 in a card and 5 on
 * its own page — whichever number you got depended on whether you arrived from the grid (which passes its
 * live-priced item in router state) or opened the URL cold.
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

const { fetchShopListingForItem, fetchTradeForItem, fetchTrade, fetchItemMeta } = vi.hoisted(() => ({
  fetchShopListingForItem: vi.fn(),
  fetchTradeForItem: vi.fn(),
  fetchTrade: vi.fn(),
  fetchItemMeta: vi.fn()
}))
vi.mock('~/lib/api', () => ({
  fetchShopListingForItem,
  fetchUnifiedListingForItem: fetchShopListingForItem,
  fetchTradeForItem,
  fetchTrade,
  fetchItemMeta,
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
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => false }))

import { ItemDetail } from '~/pages/ItemDetail'

const CONTRACT_LEGACY = CONTRACT
// $0.068 per MANA at 8 decimals — the rate that makes the 25-MANA emote 17 credits, as production did.
const LIVE_RATE = { rate: 6_800_000n, decimals: 8 }
const MANA_25 = '25000000000000000000'

// The legacy listing as the unified feed hands it over: MANA price, plus the server's own credit guess.
function legacyListing(over: Partial<CatalogItem> = {}) {
  return {
    id: 'legacy-1',
    name: 'Laser Face',
    creator: '0xother0000000000000000000000000000000other',
    contractAddress: CONTRACT_LEGACY,
    itemId: '2',
    category: 'emote',
    wearableCategory: 'dance',
    rarity: 'epic',
    network: 'MATIC',
    chainId: 80002,
    thumbnail: '',
    // What the server says. Wrong by a factor of three, and the whole point of the fix.
    priceCredits: 5,
    gender: null,
    isSmart: false,
    available: 966,
    tradeId: 'legacy-trade',
    source: 'legacy',
    acquisition: 'trade',
    manaWei: MANA_25,
    ...over
  } as CatalogItem
}

// A cold open: no router state, so the page resolves the listing itself.
function renderCold(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/item/${CONTRACT_LEGACY}/2`]}>
        <Routes>
          <Route path="/item/:contractAddress/:itemId" element={<ItemDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
const priceText = () => screen.queryByTestId('item-price')?.textContent ?? null

beforeEach(() => {
  vi.clearAllMocks()
  manaRate.value = LIVE_RATE
  fetchTrade.mockResolvedValue({ id: 'legacy-trade', signer: '0xother' })
  fetchShopListingForItem.mockResolvedValue(legacyListing())
  fetchTradeForItem.mockResolvedValue({ id: 'legacy-trade' })
  fetchItemMeta.mockResolvedValue(null)
  fetchItemVideoUrl.mockResolvedValue(null)
  fetchVrmExportBlocked.mockResolvedValue(false)
})

describe('ItemDetail — pricing a MANA-listed item opened cold', () => {
  it('should show the LIVE credit price, not the price the feed reports', async () => {
    renderCold(newClient())

    await waitFor(() => expect(priceText()).toContain('17'))
    // The server's number must never reach the page — not even for a frame, since the buyer could act on it.
    expect(priceText()).not.toContain('5')
  })

  it('should show no price while the rate is unknown, then the live one once it lands', async () => {
    manaRate.value = undefined
    const { rerender } = renderCold(newClient())

    // The listing resolves; the price does not, so the section stays on its skeleton rather than concluding
    // with the feed's snapshot.
    await waitFor(() => expect(fetchShopListingForItem).toHaveBeenCalled())
    expect(screen.queryByTestId('item-price')).not.toBeInTheDocument()

    // The oracle answers → the price appears, and it is the converted one.
    manaRate.value = LIVE_RATE
    rerender(<div />)
    renderCold(newClient())
    await waitFor(() => expect(priceText()).toContain('17'))
  })

  it('should leave a USD-pegged listing exactly as the feed priced it', async () => {
    // No manaWei → native row: its priceCredits IS the price, and no conversion applies.
    fetchShopListingForItem.mockResolvedValue(legacyListing({ manaWei: null, priceCredits: 42 } as never))
    renderCold(newClient())

    await waitFor(() => expect(priceText()).toContain('42'))
  })
})
