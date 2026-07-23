import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PurchaseRecord } from '~/lib/credits'
import type { PurchaseDisplay } from '~/lib/api'

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

vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: typeof walletState) => unknown) => (sel ? sel(walletState) : walletState)
}))

const fetchUserPurchases = vi.fn()
vi.mock('~/lib/credits', () => ({
  fetchUserPurchases: (...args: unknown[]) => fetchUserPurchases(...args)
}))

const fetchTradeDisplay = vi.fn()
vi.mock('~/lib/api', () => ({
  fetchTradeDisplay: (...args: unknown[]) => fetchTradeDisplay(...args)
}))

import { MyPurchases } from '~/pages/MyPurchases'

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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MyPurchases />
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
  fetchTradeDisplay.mockResolvedValue(null)
})

describe('when the user is not signed in', () => {
  it('should show the sign-in prompt', () => {
    walletState.session = null
    renderPage()
    expect(screen.getByText('Sign in to see your purchases')).toBeInTheDocument()
    expect(fetchUserPurchases).not.toHaveBeenCalled()
  })
})

describe('when the user has no purchases', () => {
  it('should show the empty state with a call to action', async () => {
    fetchUserPurchases.mockResolvedValue({ items: [], total: 0 })
    renderPage()
    expect(await screen.findByText('No purchases yet')).toBeInTheDocument()
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

    // One order → the header count reads "1 order".
    expect(screen.getByText('1 order')).toBeInTheDocument()
    // All three resolved names live inside the same card.
    expect(screen.getByText('Crimson Heels')).toBeInTheDocument()
    expect(screen.getByText('Regal Blue Suit')).toBeInTheDocument()
    expect(screen.getByText('Flamethrower')).toBeInTheDocument()
    // Per-order item count.
    expect(screen.getByText('3 items')).toBeInTheDocument()
  })

  it('should resolve each line image + name (fixing the "Item"/no-image bug) and link to the detail', async () => {
    renderPage()
    const img = (await screen.findAllByRole('img')).find(i => i.getAttribute('alt') === 'Crimson Heels')
    expect(img).toHaveAttribute('src', 'heels.png')
    // A resolvable line links to /item/<contract>/<id>.
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
    fetchTradeDisplay.mockResolvedValue(null) // trade not indexed yet
    renderPage()
    expect(await screen.findByText('Item')).toBeInTheDocument()
    // still shows the order card + price even without resolved metadata.
    expect(screen.getByText('1 order')).toBeInTheDocument()
  })
})

describe('when purchases come from two separate checkouts', () => {
  it('should render two order cards', async () => {
    fetchUserPurchases.mockResolvedValue({
      items: [
        record({ id: 'a', tradeId: 't1', txHash: '0xcart1', createdAt: 2_000_000_000_000 }),
        record({ id: 'b', tradeId: 't2', txHash: '0xcart2', createdAt: 1_000_000_000_000 })
      ],
      total: 2
    })
    fetchTradeDisplay.mockResolvedValue(display({ name: 'Thing' }))
    renderPage()
    await waitFor(() => expect(screen.getByText('2 orders')).toBeInTheDocument())
  })
})
