import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PurchaseRecord } from '~/lib/credits'
import type { PurchaseDisplay, SaleRecord } from '~/lib/api'
import type { ManaRate } from '~/lib/mana-rate'

const session = {
  address: '0xabc0000000000000000000000000000000000abc',
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: {} as never,
  providerType: 'injected' as never
}

let walletState: {
  session: typeof session | null
  connecting: boolean
  error: null
  signIn: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

// The page imports ~/lib/activity → ~/lib/mana-rate, which pulls decentraland-transactions at module
// load; stub it so the module resolves (the oracle read itself is mocked via ~/hooks/useManaRate).
vi.mock('decentraland-transactions', () => ({
  ContractName: { OffChainMarketplaceV2: 'OffChainMarketplaceV2' },
  getContract: () => ({ address: '0xmarket', name: 'DecentralandMarketplacePolygon', version: '1', abi: [] })
}))

vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: typeof walletState) => unknown) => (sel ? sel(walletState) : walletState)
}))

const fetchUserPurchases = vi.fn()
vi.mock('~/lib/credits', () => ({
  fetchUserPurchases: (...args: unknown[]) => fetchUserPurchases(...args)
}))

const fetchTradeDisplay = vi.fn()
const fetchAssetDisplay = vi.fn()
const fetchUserSales = vi.fn()
vi.mock('~/lib/api', () => ({
  fetchTradeDisplay: (...args: unknown[]) => fetchTradeDisplay(...args),
  fetchAssetDisplay: (...args: unknown[]) => fetchAssetDisplay(...args),
  fetchUserSales: (...args: unknown[]) => fetchUserSales(...args)
}))

// 1 MANA = $0.50 → 10 MANA = 50 credits.
const RATE: ManaRate = { rate: 50_000_000n, decimals: 8 }
const useManaRate = vi.fn()
vi.mock('~/hooks/useManaRate', () => ({
  useManaRate: (...args: unknown[]) => useManaRate(...args)
}))

import { Activity } from '~/pages/Activity'

function record(overrides: Partial<PurchaseRecord> = {}): PurchaseRecord {
  return {
    id: Math.random().toString(36).slice(2),
    tradeId: 't-' + Math.random().toString(36).slice(2),
    usdCents: 100,
    credits: 10,
    status: 'SETTLED',
    createdAt: 1_700_000_000_000,
    manaSettledWei: null,
    txHash: null,
    ...overrides
  }
}

function display(overrides: Partial<PurchaseDisplay> = {}): PurchaseDisplay {
  return {
    name: 'An Item',
    thumbnail: 'thumb.png',
    credits: 10,
    contractAddress: '0xc',
    itemId: '1',
    ...overrides
  }
}

function sale(overrides: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: 'sale-1',
    buyer: '0xb0b0000000000000000000000000000000000b0b',
    seller: session.address,
    contractAddress: '0xdef',
    tokenId: '42',
    itemId: null,
    manaWei: '10000000000000000000',
    createdAt: 1_700_000_500_000,
    txHash: '0xhash',
    category: 'wearable',
    ...overrides
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Activity />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  walletState = {
    session,
    connecting: false,
    error: null,
    signIn: vi.fn(),
    restore: vi.fn(),
    disconnect: vi.fn()
  }
  fetchUserPurchases.mockResolvedValue({ items: [], total: 0 })
  fetchUserSales.mockResolvedValue({ items: [], total: 0 })
  fetchTradeDisplay.mockResolvedValue(null)
  fetchAssetDisplay.mockResolvedValue(null)
  useManaRate.mockReturnValue({ data: RATE })
})

describe('when the user is not signed in', () => {
  it('should show the sign-in prompt and fetch nothing', () => {
    walletState.session = null
    renderPage()
    expect(screen.getByText('Sign in to see your activity')).toBeInTheDocument()
    expect(fetchUserPurchases).not.toHaveBeenCalled()
    expect(fetchUserSales).not.toHaveBeenCalled()
  })
})

describe('when the user has no activity', () => {
  it('should show the empty state', async () => {
    renderPage()
    expect(await screen.findByText('No activity yet')).toBeInTheDocument()
  })
})

describe('when three items were bought in one cart checkout', () => {
  beforeEach(() => {
    fetchUserPurchases.mockResolvedValue({
      items: [
        record({ id: 'a', tradeId: 't1', txHash: '0xcart', credits: 10, createdAt: 1_700_000_002_000 }),
        record({ id: 'b', tradeId: 't2', txHash: '0xcart', credits: 27, createdAt: 1_700_000_001_000 }),
        record({ id: 'c', tradeId: 't3', txHash: '0xcart', credits: 3, createdAt: 1_700_000_000_000 })
      ],
      total: 3
    })
    fetchTradeDisplay.mockImplementation((tradeId: string) =>
      Promise.resolve(
        {
          t1: display({ name: 'Crimson Heels', thumbnail: 'heels.png', itemId: '1' }),
          t2: display({ name: 'Regal Blue Suit', thumbnail: 'suit.png', itemId: '2' }),
          t3: display({ name: 'Flamethrower', thumbnail: 'flame.png', itemId: '3' })
        }[tradeId] ?? null
      )
    )
  })

  it('should render ONE order card containing all three line items (grouped, not three rows)', async () => {
    renderPage()
    await screen.findByText('Crimson Heels')

    expect(screen.getAllByTestId('purchase-order')).toHaveLength(1)
    expect(screen.getByText('Regal Blue Suit')).toBeInTheDocument()
    expect(screen.getByText('Flamethrower')).toBeInTheDocument()
    // Per-order item count.
    expect(screen.getByText(/3 items/)).toBeInTheDocument()
  })

  it('should resolve each line image + name and link to the item detail', async () => {
    renderPage()
    const img = (await screen.findAllByRole('img')).find(i => i.getAttribute('alt') === 'Crimson Heels')
    expect(img).toHaveAttribute('src', 'heels.png')
    const link = screen.getByText('Crimson Heels').closest('a')
    expect(link).toHaveAttribute('href', '/item/0xc/1')
  })

  it('should show a single COMPLETED status and the summed credit total', async () => {
    renderPage()
    await screen.findByText('Crimson Heels')
    expect(screen.getByText('Completed')).toBeInTheDocument()
    // 10 + 27 + 3 = 40 credits total for the order header.
    expect(screen.getByText('40')).toBeInTheDocument()
  })
})

describe('when an item purchase cannot be resolved yet (indexing lag / no trade)', () => {
  it('should fall back to a generic name without crashing', async () => {
    fetchUserPurchases.mockResolvedValue({
      items: [record({ id: 'a', tradeId: 't1', txHash: '0xz', credits: 5 })],
      total: 1
    })
    fetchTradeDisplay.mockResolvedValue(null)
    renderPage()
    expect(await screen.findByText('Item')).toBeInTheDocument()
    expect(screen.getAllByTestId('purchase-order')).toHaveLength(1)
  })
})

describe('when purchases and a sale are interleaved', () => {
  beforeEach(() => {
    fetchUserPurchases.mockResolvedValue({
      items: [record({ id: 'a', tradeId: 't1', txHash: '0xcart1', credits: 12, createdAt: 1_700_000_000_000 })],
      total: 1
    })
    fetchTradeDisplay.mockResolvedValue(display({ name: 'Purchased Thing' }))
    fetchUserSales.mockResolvedValue({ items: [sale({ createdAt: 1_700_000_500_000 })], total: 1 })
    fetchAssetDisplay.mockResolvedValue(display({ name: 'Sold Thing', tokenId: '42', itemId: undefined }))
  })

  it('should show both a purchase card and a sale card in the "all" feed', async () => {
    renderPage()
    await screen.findByText('Purchased Thing')
    expect(screen.getByTestId('purchase-order')).toBeInTheDocument()
    expect(screen.getByTestId('activity-sale')).toBeInTheDocument()
    // The sale shows its "Sold" pill, the counterparty account, and the rate-converted credits (50).
    expect(screen.getByText('Sold')).toBeInTheDocument()
    expect(screen.getByText(/Sold to 0xb0b0/)).toBeInTheDocument()
    expect(screen.getByTestId('activity-sale').textContent).toContain('50')
  })

  it('should hide purchases when the Sales filter is selected', async () => {
    renderPage()
    await screen.findByText('Sold Thing')
    fireEvent.click(screen.getByTestId('activity-filter-sales'))
    await waitFor(() => expect(screen.queryByTestId('purchase-order')).not.toBeInTheDocument())
    expect(screen.getByTestId('activity-sale')).toBeInTheDocument()
  })
})
