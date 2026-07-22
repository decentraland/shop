import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const session = {
  address: '0xabc0000000000000000000000000000000000abc',
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: {} as never,
  providerType: 'injected' as never
}

// Support both call shapes: the page uses `useWallet()` (whole store) and AssetCard uses a selector
// `useWallet(s => s.session?.address)`.
const walletState = {
  session,
  connecting: false,
  error: null,
  signIn: vi.fn(),
  restore: vi.fn(),
  disconnect: vi.fn()
}
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: typeof walletState) => unknown) => (sel ? sel(walletState) : walletState)
}))

const fetchMyAssets = vi.fn()
const postTrade = vi.fn()
const fetchTrade = vi.fn()
const fetchCollectionSaleState = vi.fn()
vi.mock('~/lib/api', () => ({
  fetchMyAssets: (...args: unknown[]) => fetchMyAssets(...args),
  postTrade: (...args: unknown[]) => postTrade(...args),
  fetchTrade: (...args: unknown[]) => fetchTrade(...args),
  fetchCollectionSaleState: (...args: unknown[]) => fetchCollectionSaleState(...args)
}))

const cancelListing = vi.fn()
vi.mock('~/lib/buy', () => ({ cancelListing: (...args: unknown[]) => cancelListing(...args) }))
vi.mock('~/lib/import', () => ({ fetchImportable: vi.fn().mockResolvedValue({ creations: [], owned: [] }) }))

const fetchPublishableItems = vi.fn()
vi.mock('~/lib/builder', () => ({ fetchPublishableItems: (...args: unknown[]) => fetchPublishableItems(...args) }))

const createUsdPeggedListing = vi.fn()
const ensureApproval = vi.fn()
vi.mock('~/lib/trades', () => ({
  createUsdPeggedListing: (...args: unknown[]) => createUsdPeggedListing(...args),
  ensureApproval: (...args: unknown[]) => ensureApproval(...args)
}))

import { MyAssets } from '~/pages/MyAssets'

function wearable(overrides = {}) {
  return {
    id: '0xcollection-1',
    contractAddress: '0xcollection',
    tokenId: '1',
    itemId: null,
    name: 'Cool Hat',
    category: 'wearable',
    image: '',
    network: 'matic',
    chainId: 80002,
    isOnSale: false,
    ...overrides
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MyAssets />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMyAssets.mockResolvedValue({ assets: [wearable()], total: 1 })
  fetchCollectionSaleState.mockResolvedValue({})
  fetchPublishableItems.mockResolvedValue([])
})

describe('when the My Assets page loads for a connected user', () => {
  it('should default to the Wearables section and query owned wearables', async () => {
    renderPage()
    expect(await screen.findByText('Cool Hat')).toBeInTheDocument()
    expect(fetchMyAssets).toHaveBeenCalledWith(session.address, expect.objectContaining({ category: 'wearable' }))
    // Rarity filter + the wearable sub-categories (via the reused CategoryFilter) are visible.
    expect(screen.getByTestId('rarity-filter')).toBeInTheDocument()
    expect(screen.getByText('Upper Body')).toBeInTheDocument()
  })
})

describe('when switching between sidebar sections', () => {
  it('should query emotes when the Emotes section is selected', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Cool Hat')

    await user.click(screen.getByRole('button', { name: /emotes/i }))

    await waitFor(() =>
      expect(fetchMyAssets).toHaveBeenLastCalledWith(session.address, expect.objectContaining({ category: 'emote' }))
    )
  })

  it('should query owned names and hide the rarity/category filters for the Names section', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Cool Hat')

    await user.click(screen.getByRole('button', { name: /^names$/i }))

    await waitFor(() =>
      expect(fetchMyAssets).toHaveBeenLastCalledWith(session.address, expect.objectContaining({ category: 'ens' }))
    )
    // Names carry no rarity/category, so those filter groups are gone.
    expect(screen.queryByTestId('rarity-filter')).not.toBeInTheDocument()
    expect(screen.queryByTestId('category-filter')).not.toBeInTheDocument()
  })
})

describe('when the Status filter changes', () => {
  it('should query only on-sale items when On Sale is picked', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Cool Hat')

    await user.click(screen.getByRole('radio', { name: /on sale/i }))

    await waitFor(() =>
      expect(fetchMyAssets).toHaveBeenLastCalledWith(session.address, expect.objectContaining({ onlyOnSale: true }))
    )
  })
})

describe('when the Rarity filter changes', () => {
  it('should query with the selected rarity', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Cool Hat')

    await user.click(within(screen.getByTestId('rarity-filter')).getByText(/^legendary$/i))

    await waitFor(() =>
      expect(fetchMyAssets).toHaveBeenLastCalledWith(
        session.address,
        expect.objectContaining({ rarities: ['legendary'] })
      )
    )
  })
})

describe('when a connected user lists an owned asset', () => {
  beforeEach(() => {
    ensureApproval.mockResolvedValue(undefined)
    createUsdPeggedListing.mockResolvedValue({ signer: session.address, signature: '0xsig', type: 'public_nft_order' })
    postTrade.mockResolvedValue({ id: 'trade-1' })
  })

  it('should approve, sign a USD-pegged listing and publish it via the SellModal', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /put on sale/i }))

    const dialog = await screen.findByRole('dialog')
    const price = within(dialog).getByLabelText(/price/i)
    await user.clear(price)
    await user.type(price, '50') // 50 whole credits = $5.00
    await user.click(within(dialog).getByRole('button', { name: /put on sale/i }))

    expect(await within(dialog).findByText(/on sale!/i)).toBeInTheDocument()
    expect(ensureApproval).toHaveBeenCalledTimes(1)
    expect(createUsdPeggedListing).toHaveBeenCalledWith(
      expect.objectContaining({
        usdPrice: 5,
        nft: expect.objectContaining({ contractAddress: '0xcollection', tokenId: '1', chainId: 80002 })
      })
    )
    expect(postTrade).toHaveBeenCalledWith(expect.objectContaining({ type: 'public_nft_order' }), session.identity)
  })
})

describe('when an owned asset is already on sale', () => {
  it('should offer a remove-from-sale control that cancels the listing', async () => {
    const user = userEvent.setup()
    fetchMyAssets.mockResolvedValue({
      assets: [wearable({ isOnSale: true, listingPrice: 30, tradeId: 'trade-9' })],
      total: 1
    })
    fetchTrade.mockResolvedValue({ id: 'trade-9' })
    cancelListing.mockResolvedValue(undefined)
    renderPage()

    await user.click(await screen.findByTestId('card-unlist'))

    await waitFor(() => expect(fetchTrade).toHaveBeenCalledWith('trade-9'))
    expect(cancelListing).toHaveBeenCalledTimes(1)
  })
})

describe('when viewing My Creations', () => {
  const creation = {
    id: 'builder-uuid-1',
    collectionId: 'col-1',
    collectionName: 'My Collection',
    contractAddress: '0xcreated',
    blockchainItemId: '4',
    name: 'My Sword',
    category: 'wearable',
    rarity: 'epic',
    thumbnail: '',
    type: 'wearable' as const,
    isPublished: true,
    isApproved: true,
    totalSupply: 0,
    maxSupply: 100,
    remainingSupply: 100,
    minters: []
  }

  it('should list the creator’s publishable items with a list control', async () => {
    const user = userEvent.setup()
    fetchPublishableItems.mockResolvedValue([creation])
    fetchCollectionSaleState.mockResolvedValue({}) // nothing on sale yet
    renderPage()
    await screen.findByText('Cool Hat')

    await user.click(screen.getByRole('button', { name: /my creations/i }))

    expect(await screen.findByText('My Sword')).toBeInTheDocument()
    // Not on sale → the card exposes a "list" control (put on sale), not an unlist one.
    expect(await screen.findByTestId('card-list')).toBeInTheDocument()
    expect(screen.queryByTestId('card-unlist')).not.toBeInTheDocument()
  })

  it('should show an unlist control for a creation already on sale', async () => {
    const user = userEvent.setup()
    fetchPublishableItems.mockResolvedValue([creation])
    fetchCollectionSaleState.mockResolvedValue({ '4': { isOnSale: true, priceCredits: 20, tradeId: 'trade-7' } })
    renderPage()
    await screen.findByText('Cool Hat')

    await user.click(screen.getByRole('button', { name: /my creations/i }))

    expect(await screen.findByText('My Sword')).toBeInTheDocument()
    expect(await screen.findByTestId('card-unlist')).toBeInTheDocument()
    expect(screen.queryByTestId('card-list')).not.toBeInTheDocument()
  })
})
