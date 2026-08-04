import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Assets pulls a lot of heavy ESM transitively (checkout + names libs → decentraland-transactions
// cross-chain), which doesn't resolve under vitest — mock those seams. We only care that selecting
// the NAMEs category swaps the grid for the NAMEs page.
vi.mock('~/lib/api', () => ({
  fetchShopItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchTrade: vi.fn()
}))
vi.mock('~/lib/collections', () => ({ fetchCatalogItems: vi.fn().mockResolvedValue({ items: [], total: 0 }) }))
vi.mock('~/lib/mana-rate', () => ({ manaWeiToCredits: () => 10, manaWeiToUsdCents: () => 100 }))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined, isError: false }) }))
vi.mock('~/lib/buy', () => ({ buyWithCredits: vi.fn() }))
vi.mock('~/lib/gasless-config', () => ({ gaslessEnabled: () => false }))
vi.mock('~/lib/buy-gasless', () => ({
  buyGasless: vi.fn(),
  waitForSettlement: vi.fn(),
  GaslessUnavailableError: class extends Error {},
  SettlementPendingError: class extends Error {}
}))
vi.mock('~/lib/analytics', () => ({ track: vi.fn(), errorCode: () => 'x', isUserRejection: () => false }))

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

beforeEach(() => vi.clearAllMocks())

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
