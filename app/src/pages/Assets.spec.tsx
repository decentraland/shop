import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { UnifiedListing } from '~/lib/api'

// Assets pulls a lot of heavy ESM transitively (checkout + names libs → decentraland-transactions
// cross-chain), which doesn't resolve under vitest — mock those seams. We only care that selecting
// the NAMEs category swaps the grid for the NAMEs page.
vi.mock('~/lib/api', () => ({
  fetchShopItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchTrade: vi.fn()
}))
vi.mock('~/lib/collections', () => ({ fetchCatalogItems: vi.fn().mockResolvedValue({ items: [], total: 0 }) }))
vi.mock('~/lib/mana-rate', () => ({ manaWeiToCredits: () => 10, manaWeiToUsdCents: () => 100 }))
// The oracle read is a query with THREE states the grid has to tell apart (pending / errored / resolved),
// so it's a controllable stub rather than a fixed value. Default: settled with no rate (the errored case).
const { useManaRate } = vi.hoisted(() => ({
  useManaRate: vi.fn((): { data?: { rate: bigint; decimals: number }; isError: boolean; isPending: boolean } => ({
    data: undefined,
    isError: false,
    isPending: false
  }))
}))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate }))
vi.mock('~/lib/buy', () => ({ buyWithCredits: vi.fn() }))
vi.mock('~/lib/gasless-config', () => ({ gaslessEnabled: () => false }))
vi.mock('~/lib/buy-gasless', () => ({
  buyGasless: vi.fn(),
  waitForSettlement: vi.fn(),
  GaslessUnavailableError: class extends Error {},
  SettlementPendingError: class extends Error {}
}))
vi.mock('~/lib/analytics', () => ({
  track: vi.fn(),
  errorCode: () => 'x',
  isUserRejection: () => false,
  // Reached through lib/ownership when a real AssetCard renders in the grid (own-listing check).
  isPrimaryItem: (item: { itemId?: string | null; tokenId?: string }) => !item.tokenId && !!item.itemId
}))

// The names lib (heavy) — stand-ins are enough for the NAMEs page to mount.
vi.mock('~/lib/names', () => ({
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 15,
  NAME_PRICE_IN_WEI: '100000000000000000000',
  validateName: (raw: string) => (raw.trim().length >= 2 ? { ok: true } : { ok: false, reason: 'too-short' }),
  sanitizeNameInput: (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15),
  checkNameAvailability: vi.fn().mockResolvedValue('available'),
  registerNameWithUsdCredits: vi.fn()
}))

const state = {
  session: {
    address: '0xabc0000000000000000000000000000000000abc',
    identity: {},
    signer: {},
    providerType: 'injected'
  },
  signIn: vi.fn(),
  connecting: false,
  error: null,
  restore: vi.fn(),
  disconnect: vi.fn()
}
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: unknown) => unknown) => (typeof sel === 'function' ? sel(state) : state)
}))

import { Assets } from '~/pages/Assets'
import { fetchShopItems } from '~/lib/api'
import { fetchCatalogItems } from '~/lib/collections'

function LocationProbe() {
  return <span data-testid="location-search">{useLocation().search}</span>
}

function renderAssets(entry = '/items') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Assets />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// The filter set the grid last asked the server for.
async function lastShopItemsCall() {
  await waitFor(() => expect(fetchShopItems).toHaveBeenCalled())
  return vi.mocked(fetchShopItems).mock.calls.at(-1)![0]
}

beforeEach(() => {
  vi.clearAllMocks()
  useManaRate.mockReturnValue({ data: undefined, isError: false, isPending: false })
  vi.mocked(fetchShopItems).mockResolvedValue({ items: [], total: 0 })
})

/**
 * The on-sale grid renders a legacy row at the LIVE oracle rate, and a legacy row it cannot price is
 * rendered as a view-only card instead (no purchase at a stale number). "Cannot price" has to mean the
 * oracle read FAILED, never that it is still running — the two were indistinguishable, so for the whole
 * window between the item feed landing (one request) and the oracle answering (three sequential on-chain
 * round-trips, see lib/mana-rate) the grid published every row as a VIEW card: a full-width dark CTA that
 * is not part of the on-sale card at all, with no creator line and no chips. Production makes it the rule
 * rather than a rare race — every row of /v3/catalog/unified is `source: 'legacy'`.
 */
describe('Assets — on-sale grid while the MANA oracle read is in flight', () => {
  const legacyRow = {
    id: 'l1',
    name: 'Legacy Hat',
    creator: '0xc'.padEnd(42, '0'),
    contractAddress: '0xabc',
    itemId: '3',
    category: 'wearable',
    rarity: 'rare',
    network: 'MATIC',
    chainId: 80002,
    thumbnail: '',
    priceCredits: 5,
    gender: null,
    isSmart: false,
    source: 'legacy',
    acquisition: 'trade',
    manaWei: '15000000000000000000'
  } as UnifiedListing

  it('should keep the skeleton up rather than render the row as a VIEW card', async () => {
    vi.mocked(fetchShopItems).mockResolvedValue({ items: [legacyRow], total: 1 })
    useManaRate.mockReturnValue({ data: undefined, isError: false, isPending: true })

    renderAssets()
    // The row HAS arrived (the count is rendered from the same response) — what must not have happened is
    // committing it to a card while the price it would show is still unknown.
    await waitFor(() => expect(screen.getByTestId('browse-count').textContent).toContain('1'))

    expect(screen.queryByTestId('card-view')).toBeNull()
    expect(screen.queryByTestId('card')).toBeNull()
  })

  it('should render the row as an ordinary add-to-cart card once the rate resolves', async () => {
    vi.mocked(fetchShopItems).mockResolvedValue({ items: [legacyRow], total: 1 })
    useManaRate.mockReturnValue({ data: { rate: 1n, decimals: 8 }, isError: false, isPending: false })

    renderAssets()

    expect(await screen.findByTestId('card')).toBeInTheDocument()
    expect(screen.getByTestId('card-cart')).toBeInTheDocument()
    expect(screen.queryByTestId('card-view')).toBeNull()
  })

  it('should still fall back to a VIEW card when the oracle read has settled with no rate', async () => {
    vi.mocked(fetchShopItems).mockResolvedValue({ items: [legacyRow], total: 1 })
    useManaRate.mockReturnValue({ data: undefined, isError: true, isPending: false })

    renderAssets()

    // A failed read is a real answer: the row is unpriceable, so it must not offer a purchase.
    expect(await screen.findByTestId('card-view')).toBeInTheDocument()
    expect(screen.queryByTestId('card-cart')).toBeNull()
  })
})

describe('Assets — NAMEs category', () => {
  it('should render the collectibles grid by default (not the NAMEs page)', () => {
    renderAssets()
    expect(screen.getByTestId('browse')).toBeInTheDocument()
    expect(screen.queryByTestId('names-page')).not.toBeInTheDocument()
  })

  it('should render the NAMEs page when the NAMEs category is selected', async () => {
    renderAssets()
    await userEvent.click(screen.getByRole('button', { name: 'NAMEs' }))
    expect(await screen.findByTestId('names-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Get your unique NAME!' })).toBeInTheDocument()
  })
})

describe('Assets — search scope', () => {
  it('should search every category so emote matches are not silently dropped', async () => {
    renderAssets('/items?q=chapeau')
    expect(await lastShopItemsCall()).toMatchObject({ category: 'all', search: 'chapeau', onSale: true })
  })

  it('should still open on wearables when browsing without a query', async () => {
    renderAssets('/items')
    expect(await lastShopItemsCall()).toMatchObject({ category: 'wearable', search: undefined })
  })

  it('should honour an explicit category over the search default', async () => {
    renderAssets('/items?q=chapeau&category=emote')
    expect(await lastShopItemsCall()).toMatchObject({ category: 'emote', search: 'chapeau' })
  })
})

describe('Assets — status filter in the URL', () => {
  // Radio order in the Status section: All, On Sale, Not for Sale.
  const statusRadios = () => screen.getAllByRole('radio')

  it('should default to the on-sale grid when the URL says nothing', async () => {
    renderAssets('/items?q=chapeau')
    await lastShopItemsCall()
    expect(fetchCatalogItems).not.toHaveBeenCalled()
  })

  it('should restore a shared not-for-sale search from the URL', async () => {
    renderAssets('/items?q=chapeau&status=not_for_sale')
    await waitFor(() => expect(fetchCatalogItems).toHaveBeenCalled())
    expect(vi.mocked(fetchCatalogItems).mock.calls.at(-1)![0]).toMatchObject({ search: 'chapeau', isOnSale: false })
    expect(fetchShopItems).not.toHaveBeenCalled()
  })

  it('should query the whole catalog, on sale or not, for the "all" status', async () => {
    renderAssets('/items?q=chapeau&status=all')
    await waitFor(() => expect(fetchCatalogItems).toHaveBeenCalled())
    expect(vi.mocked(fetchCatalogItems).mock.calls.at(-1)![0]).toMatchObject({ search: 'chapeau', isOnSale: undefined })
  })

  it('should fall back to on sale when the URL carries a status it does not recognise', async () => {
    renderAssets('/items?q=chapeau&status=bogus')
    await lastShopItemsCall()
    expect(fetchCatalogItems).not.toHaveBeenCalled()
  })

  it('should write the chosen status to the URL so the view can be shared', async () => {
    renderAssets('/items?q=chapeau')
    await userEvent.click(statusRadios()[2])
    await waitFor(() => expect(screen.getByTestId('location-search')).toHaveTextContent('status=not_for_sale'))
    expect(screen.getByTestId('location-search')).toHaveTextContent('q=chapeau')
  })

  it('should drop the status param again when the default is reselected', async () => {
    renderAssets('/items?q=chapeau&status=all')
    await userEvent.click(statusRadios()[1])
    await waitFor(() => expect(screen.getByTestId('location-search')).not.toHaveTextContent('status='))
  })
})
