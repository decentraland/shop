import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// The connected wallet — one of the resale sellers below is this address (the "own listing" case).
const walletState = { session: { address: '0xOWNER0000000000000000000000000000000owner' } }
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: typeof walletState) => unknown) => (sel ? sel(walletState) : walletState)
}))

// Cart is empty; capture add() calls.
const add = vi.fn()
const cartState = { add, items: [] as unknown[] }
vi.mock('~/store/cart', () => ({
  useCart: (sel: (s: typeof cartState) => unknown) => sel(cartState)
}))

// No legacy rows here → the rate hook is inert.
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined }) }))

// CreatorBadge resolves the seller via useProfile; mock it so the badge falls back to a short address.
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))

// Keep the heavy checkout modals out of the render — they aren't opened in these tests.
vi.mock('~/components/BuyModal', () => ({ BuyModal: () => null }))
vi.mock('~/components/MarketCheckout', () => ({ MarketCheckout: () => null }))

const fetchItemResales = vi.fn()
const fetchResaleTokenInfos = vi.fn()
const fetchClassicItemOrders = vi.fn().mockResolvedValue([])
vi.mock('~/lib/api', () => ({
  fetchItemResales: (...a: unknown[]) => fetchItemResales(...a),
  fetchResaleTokenInfos: (...a: unknown[]) => fetchResaleTokenInfos(...a),
  fetchClassicItemOrders: (...a: unknown[]) => fetchClassicItemOrders(...a)
}))

import { ItemResales } from './ItemResales'
import type { CatalogItem } from '~/lib/api'

const item = { contractAddress: '0xc', itemId: '5', name: 'Hat' } as CatalogItem

// A native (credit-buyable) resale row, sorted cheapest-first by the fetcher.
function resale(overrides: Record<string, unknown>) {
  return {
    id: overrides.tradeId ?? overrides.id,
    source: 'native',
    manaWei: null,
    contractAddress: '0xc',
    itemId: '5',
    name: 'Hat',
    thumbnail: '',
    rarity: 'rare',
    category: 'wearable',
    network: 'MATIC',
    chainId: 80002,
    priceCredits: 10,
    gender: null,
    isSmart: false,
    ...overrides
  }
}

function renderResales() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ItemResales item={item} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  fetchItemResales.mockReset()
  fetchResaleTokenInfos.mockReset()
  add.mockClear()
  cartState.items = []
})

describe('ItemResales', () => {
  it('renders each row with its issued number and seller, cheapest-first', async () => {
    fetchItemResales.mockResolvedValue([
      resale({ tradeId: 't-cheap', tokenId: '10', priceCredits: 12 }),
      resale({ tradeId: 't-mid', tokenId: '20', priceCredits: 30 })
    ])
    fetchResaleTokenInfos.mockResolvedValue({
      '10': { seller: '0xaaaa00000000000000000000000000000000aaaa', issuedId: '3' },
      '20': { seller: '0xbbbb00000000000000000000000000000000bbbb', issuedId: '9' }
    })
    renderResales()

    // Wait until the per-token seller/issued lookup resolves (rows render before it).
    await waitFor(() => expect(screen.getAllByTestId('resale-issued')).toHaveLength(2))
    const rows = screen.getAllByTestId('resale-row')
    expect(rows).toHaveLength(2)
    // Rendered in the fetcher's cheapest-first order.
    expect(within(rows[0]).getByTestId('resale-issued').textContent).toBe('#3')
    expect(within(rows[1]).getByTestId('resale-issued').textContent).toBe('#9')
    // The seller shows as a resolved (here short-address) account on its own line.
    expect(screen.getAllByTestId('resale-seller')).toHaveLength(2)
    expect(within(rows[0]).getByText(/0xaaaa…aaaa/)).toBeTruthy()
  })

  it('renders your own listing as a non-buyable "Your listing" chip', async () => {
    fetchItemResales.mockResolvedValue([
      resale({ tradeId: 't-own', tokenId: '10', priceCredits: 12 }),
      resale({ tradeId: 't-other', tokenId: '20', priceCredits: 30 })
    ])
    fetchResaleTokenInfos.mockResolvedValue({
      '10': { seller: walletState.session.address, issuedId: '3' },
      '20': { seller: '0xbbbb00000000000000000000000000000000bbbb', issuedId: '9' }
    })
    renderResales()

    const ownChip = await screen.findByTestId('resale-own')
    expect(ownChip.textContent).toMatch(/your listing/i)
    // Exactly one buyable row remains (the other seller); the own row has no Buy / Add-to-cart.
    await waitFor(() => expect(screen.getAllByTestId('resale-buy')).toHaveLength(1))
    const ownRow = ownChip.closest('[data-testid="resale-row"]') as HTMLElement
    expect(within(ownRow).queryByTestId('resale-buy')).toBeNull()
    expect(within(ownRow).queryByTestId('resale-add')).toBeNull()
  })

  it('paginates with a "Show more" pager', async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      resale({ tradeId: `t${i}`, tokenId: String(i), priceCredits: 10 + i })
    )
    fetchItemResales.mockResolvedValue(many)
    fetchResaleTokenInfos.mockResolvedValue({})
    renderResales()

    // First page shows 8 rows + a Show more button.
    await waitFor(() => expect(screen.getAllByTestId('resale-row')).toHaveLength(8))
    const more = screen.getByTestId('resale-show-more')
    await userEvent.click(more)

    // The remaining rows reveal and the pager disappears.
    await waitFor(() => expect(screen.getAllByTestId('resale-row')).toHaveLength(10))
    expect(screen.queryByTestId('resale-show-more')).toBeNull()
  })
})
