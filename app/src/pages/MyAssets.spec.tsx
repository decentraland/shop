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

const fetchImportable = vi.fn()
vi.mock('~/lib/import', () => ({ fetchImportable: (...args: unknown[]) => fetchImportable(...args) }))

const fetchPublishableItems = vi.fn()
vi.mock('~/lib/builder', () => ({ fetchPublishableItems: (...args: unknown[]) => fetchPublishableItems(...args) }))

const createUsdPeggedListing = vi.fn()
const ensureApproval = vi.fn()
vi.mock('~/lib/trades', () => ({
  createUsdPeggedListing: (...args: unknown[]) => createUsdPeggedListing(...args),
  ensureApproval: (...args: unknown[]) => ensureApproval(...args)
}))

import { MyAssets } from '~/pages/MyAssets'
import { MANA_PRICING_PROMPT, isPromptDismissed } from '~/lib/dismissed-prompts'

const OTHER_ADDRESS = '0xdef0000000000000000000000000000000000def'

// One classic (MANA-priced) listing, in the shape /v3/catalog/importable returns.
function classicListing(overrides = {}) {
  return {
    oldTradeId: 'old-trade-1',
    listingType: 'primary' as const,
    contractAddress: '0xcollection',
    itemId: '3',
    tokenId: null,
    name: 'Old Hat',
    thumbnail: '',
    rarity: 'legendary',
    category: 'wearable',
    wearableCategory: 'hat',
    manaWei: '3000000000000000000000',
    available: 1,
    network: 'MATIC',
    chainId: 80002,
    suggestedCredits: 332,
    ...overrides
  }
}

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
      <MemoryRouter initialEntries={['/my-items']}>
        <Routes>
          <Route path="/my-items" element={<MyAssets />} />
          <Route path="/item/:contractAddress/:itemId" element={<DetailProbe />} />
          <Route path="/token/:contractAddress/:tokenId" element={<DetailProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  walletState.session = session
  fetchMyAssets.mockResolvedValue({ assets: [wearable()], total: 1 })
  fetchCollectionSaleState.mockResolvedValue({})
  fetchPublishableItems.mockResolvedValue([])
  fetchImportable.mockResolvedValue({ creations: [], owned: [] })
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

    // Landed on the TOKEN detail route for THIS exact token (contractAddress/tokenId) — an owned copy
    // opens the specific /token page, not the generic /item page.
    expect(await screen.findByTestId('detail-path')).toHaveTextContent('/token/0xcollection/1')
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

  it('should show a MANAGE cta on each creation (listing happens on the item detail page)', async () => {
    const user = userEvent.setup()
    fetchPublishableItems.mockResolvedValue([creation])
    fetchCollectionSaleState.mockResolvedValue({}) // nothing on sale yet
    renderPage()
    await screen.findByText('Cool Hat')

    await user.click(screen.getByRole('button', { name: /my creations/i }))

    expect(await screen.findByText('My Sword')).toBeInTheDocument()
    // Creations share the owned-asset MANAGE cta: it opens the item detail page, where publishing /
    // editing / removing live. No inline list/unlist control is rendered from the My Creations card.
    const manage = await screen.findByTestId('card-manage')
    expect(manage.textContent).toMatch(/manage/i)
    expect(screen.queryByTestId('card-list')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-unlist')).not.toBeInTheDocument()
  })

  it('should navigate to the creation’s item detail page when MANAGE is clicked', async () => {
    const user = userEvent.setup()
    fetchPublishableItems.mockResolvedValue([creation])
    fetchCollectionSaleState.mockResolvedValue({
      '0xcreated-4': { isOnSale: true, priceCredits: 20, tradeId: 'trade-7' }
    })
    renderPageWithRoutes()
    await screen.findByText('Cool Hat')

    await user.click(screen.getByRole('button', { name: /my creations/i }))
    await user.click(await screen.findByTestId('card-manage'))

    // A creation has no specific tokenId, so MANAGE opens the generic /item detail route (by itemId),
    // not a /token route.
    expect(await screen.findByTestId('detail-path')).toHaveTextContent('/item/0xcreated/4')
  })
})

describe('when the seller still has classic (MANA-priced) listings', () => {
  beforeEach(() => {
    fetchImportable.mockResolvedValue({ creations: [classicListing()], owned: [] })
  })

  it('should prompt them to switch to credit pricing', async () => {
    renderPage()

    expect(await screen.findByTestId('new-pricing-modal')).toBeInTheDocument()
  })

  it('should show the standing banner alongside it, counting the listings', async () => {
    renderPage()

    const banner = await screen.findByTestId('mana-pricing-banner')
    expect(banner).toHaveTextContent('1 item is still using MANA pricing')
    expect(screen.getByTestId('mana-pricing-banner-cta').getAttribute('href')).toBe('/import')
  })

  it('should send them to the migration tool when they accept', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/my-items']}>
          <Routes>
            <Route path="/my-items" element={<MyAssets />} />
            <Route path="/import" element={<DetailProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await user.click(await screen.findByTestId('new-pricing-confirm'))

    expect(await screen.findByTestId('detail-path')).toHaveTextContent('/import')
  })

  it('should not re-open the prompt after a plain dismissal within the same visit', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByTestId('new-pricing-later'))

    await waitFor(() => expect(screen.queryByTestId('new-pricing-modal')).not.toBeInTheDocument())
    // Nothing was persisted, so a later visit would still be prompted.
    expect(isPromptDismissed(MANA_PRICING_PROMPT, session.address)).toBe(false)
  })
})

describe('when the seller has no classic listings', () => {
  it('should neither prompt nor show the banner', async () => {
    renderPage()

    expect(await screen.findByText('Cool Hat')).toBeInTheDocument()
    expect(screen.queryByTestId('new-pricing-modal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mana-pricing-banner')).not.toBeInTheDocument()
  })
})

describe('when the seller opts out of the pricing prompt', () => {
  beforeEach(() => {
    fetchImportable.mockResolvedValue({ creations: [classicListing()], owned: [] })
  })

  async function optOutAndUnmount() {
    const user = userEvent.setup()
    const view = renderPage()
    await user.click(await screen.findByTestId('new-pricing-opt-out'))
    await user.click(screen.getByTestId('new-pricing-later'))
    await waitFor(() => expect(screen.queryByTestId('new-pricing-modal')).not.toBeInTheDocument())
    view.unmount()
  }

  it('should keep the prompt away across a remount', async () => {
    await optOutAndUnmount()

    renderPage()

    expect(await screen.findByText('Cool Hat')).toBeInTheDocument()
    expect(screen.queryByTestId('new-pricing-modal')).not.toBeInTheDocument()
  })

  it('should still show the banner, so the tool stays reachable', async () => {
    await optOutAndUnmount()

    renderPage()

    expect(await screen.findByTestId('mana-pricing-banner')).toBeInTheDocument()
  })

  it('should NOT silence the prompt for a different account on the same browser', async () => {
    await optOutAndUnmount()

    // A shared machine, or the same person switching accounts: the other seller has not been asked yet.
    walletState.session = { ...session, address: OTHER_ADDRESS }
    renderPage()

    expect(await screen.findByTestId('new-pricing-modal')).toBeInTheDocument()
  })
})
