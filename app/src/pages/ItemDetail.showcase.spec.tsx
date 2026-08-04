import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'

/**
 * THE SHOWCASE CLIP ON THE ITEM PAGE.
 *
 * A smart wearable's value is what it DOES in world, which neither the 3D preview (the garment, standing
 * still) nor the thumbnail can show — so creators may upload a clip and the page offers it over the preview.
 * These assert what the visitor gets, and just as importantly what an ordinary wearable does NOT pay for.
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
const { fetchItemVideoUrl } = vi.hoisted(() => ({ fetchItemVideoUrl: vi.fn() }))
vi.mock('~/lib/builder', () => ({ fetchPublishableItems: vi.fn().mockResolvedValue([]), fetchItemVideoUrl }))
vi.mock('~/hooks/useRelatedItems', () => ({ useRelatedItems: () => ({ items: [], isFetched: true }) }))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined, isError: false }) }))
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => false }))

import { ItemDetail } from '~/pages/ItemDetail'

const VIDEO_URL = 'https://builder.test/v1/storage/contents/hash-video'

// A plain third-party item on sale, in the shape a grid row hands over in router state.
function item(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'trade-1',
    name: 'Laser Face',
    creator: '0xother0000000000000000000000000000000other',
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
    tradeId: 'trade-1',
    ...overrides
  }
}

function renderPdp(qc: QueryClient, seed: CatalogItem) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[{ pathname: `/item/${CONTRACT}/1`, state: { item: seed, tradeId: seed.tradeId } }]}
      >
        <Routes>
          <Route path="/item/:contractAddress/:itemId" element={<ItemDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
const playCta = () => screen.queryByTestId('play-showcase')

beforeEach(() => {
  vi.clearAllMocks()
  fetchTrade.mockResolvedValue({ id: 'trade-1', signer: '0xother' })
  fetchShopListingForItem.mockResolvedValue(item())
  fetchTradeForItem.mockResolvedValue({ id: 'trade-1' })
  fetchItemVideoUrl.mockResolvedValue(null)
})

describe('ItemDetail — the showcase clip a creator uploaded', () => {
  it('should offer the clip over the preview and play it in a dialog', async () => {
    fetchItemVideoUrl.mockResolvedValue(VIDEO_URL)
    renderPdp(newClient(), item({ isSmart: true }))

    await waitFor(() => expect(playCta()).toBeInTheDocument())
    // Nothing is playing until the visitor asks for it — no autoplaying video on the page itself.
    expect(screen.queryByTestId('showcase-video')).not.toBeInTheDocument()

    await userEvent.click(playCta() as HTMLElement)

    const video = await screen.findByTestId('showcase-video')
    expect(video).toHaveAttribute('src', VIDEO_URL)
    // Muted, because every browser blocks an unmuted autoplay and the clip would open looking broken.
    // React writes `muted` as a DOM property rather than an attribute, so this is where it shows up.
    expect((video as HTMLVideoElement).muted).toBe(true)
    expect(video).toHaveAttribute('controls')
    expect(fetchItemVideoUrl).toHaveBeenCalledWith(CONTRACT, '1')
  })

  it('should close the dialog on Escape', async () => {
    fetchItemVideoUrl.mockResolvedValue(VIDEO_URL)
    renderPdp(newClient(), item({ isSmart: true }))

    await userEvent.click(await screen.findByTestId('play-showcase'))
    expect(await screen.findByTestId('showcase-video')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('showcase-video')).not.toBeInTheDocument())
  })

  it('should offer nothing when the creator uploaded no clip', async () => {
    renderPdp(newClient(), item({ isSmart: true }))

    await waitFor(() => expect(fetchItemVideoUrl).toHaveBeenCalled())
    expect(playCta()).not.toBeInTheDocument()
  })

  it('should not even look for a clip on an ordinary wearable', async () => {
    renderPdp(newClient(), item({ isSmart: false }))

    await waitFor(() => expect(screen.getByTestId('item-price')).toBeInTheDocument())
    expect(fetchItemVideoUrl).not.toHaveBeenCalled()
    expect(playCta()).not.toBeInTheDocument()
  })
})
