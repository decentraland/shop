import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
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

// Reads the pathname of wherever the router lands — lets a test assert that MANAGE navigated to the
// item detail route for the right token.
function DetailProbe() {
  const loc = useLocation()
  return <div data-testid="detail-path">{loc.pathname}</div>
}

function renderPageWithRoutes() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/my-assets']}>
        <Routes>
          <Route path="/my-assets" element={<MyAssets />} />
          <Route path="/item/:contractAddress/:tokenId" element={<DetailProbe />} />
        </Routes>
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

describe('when a connected user manages an owned asset', () => {
  it('should show a MANAGE cta on the owned card and no inline put-on-sale control', async () => {
    renderPage()

    const manage = await screen.findByTestId('card-manage')
    expect(manage.textContent).toMatch(/manage/i)
    // The inline SellModal entry point is gone — listing now happens on the item detail page.
    expect(screen.queryByRole('button', { name: /put on sale/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-unlist')).not.toBeInTheDocument()
  })

  it('should navigate to the item detail page for that token when MANAGE is clicked (no inline dialog)', async () => {
    const user = userEvent.setup()
    renderPageWithRoutes()

    await user.click(await screen.findByTestId('card-manage'))

    // Landed on the item detail route for THIS exact token (contractAddress/tokenId)…
    expect(await screen.findByTestId('detail-path')).toHaveTextContent('/item/0xcollection/1')
    // …and no sell dialog was opened from My Assets.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('when an owned asset is already on sale', () => {
  it('should still expose only a MANAGE cta (removal now lives on the detail page)', async () => {
    fetchMyAssets.mockResolvedValue({
      assets: [wearable({ isOnSale: true, listingPrice: 30, tradeId: 'trade-9' })],
      total: 1
    })
    renderPage()

    expect(await screen.findByTestId('card-manage')).toBeInTheDocument()
    expect(screen.queryByTestId('card-unlist')).not.toBeInTheDocument()
  })
})

describe('when the owner holds multiple copies of the same item', () => {
  it('should render one MANAGE card per token, each tagged with its own issued number', async () => {
    // Same item (itemId 7), two distinct tokens the wallet owns — the NFT endpoint returns a row per
    // token, so the grid must render TWO cards, not collapse them into one.
    fetchMyAssets.mockResolvedValue({
      assets: [
        wearable({ id: '0xcollection-11', tokenId: '11', issuedId: '11', itemId: '7' }),
        wearable({ id: '0xcollection-22', tokenId: '22', issuedId: '412', itemId: '7' })
      ],
      total: 2
    })
    renderPage()

    await screen.findAllByText('Cool Hat')
    expect(screen.getAllByTestId('card')).toHaveLength(2)
    // Each copy has its own MANAGE cta and is told apart by its mint index.
    expect(screen.getAllByTestId('card-manage')).toHaveLength(2)
    expect(screen.getByText('#11')).toBeInTheDocument()
    expect(screen.getByText('#412')).toBeInTheDocument()
  })
})

describe('when viewing owned Names', () => {
  it('should render a MANAGE cta linking to the name’s Builder management page in a new tab', async () => {
    const user = userEvent.setup()
    fetchMyAssets.mockImplementation((_addr: string, opts: { category?: string }) =>
      Promise.resolve(
        opts.category === 'ens'
          ? { assets: [wearable({ id: '0xens-5', category: 'ens', name: 'CoolName', tokenId: '5' })], total: 1 }
          : { assets: [wearable()], total: 1 }
      )
    )
    renderPage()
    await screen.findByText('Cool Hat')

    await user.click(screen.getByRole('button', { name: /^names$/i }))

    const manage = await screen.findByTestId('card-manage')
    // External deep link to the Builder's per-name management page (matches the classic marketplace).
    expect(manage.getAttribute('href')).toContain('/builder/names/CoolName')
    expect(manage.getAttribute('target')).toBe('_blank')
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
