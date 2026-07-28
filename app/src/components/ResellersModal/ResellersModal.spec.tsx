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

const localeState = { locale: 'en' as const }
vi.mock('~/store/locale', () => ({
  useLocale: (sel: (s: typeof localeState) => unknown) => sel(localeState)
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

import { ResellersModal } from './ResellersModal'
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

const onClose = vi.fn()

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ResellersModal item={item} onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  fetchItemResales.mockReset()
  fetchResaleTokenInfos.mockReset()
  add.mockClear()
  onClose.mockClear()
  cartState.items = []
})

describe('ResellersModal', () => {
  it('renders as an accessible dialog with the four designed columns', async () => {
    fetchItemResales.mockResolvedValue([resale({ tradeId: 't-1', tokenId: '10', priceCredits: 12 })])
    fetchResaleTokenInfos.mockResolvedValue({ '10': { seller: '0xaaaa', issuedId: '3' } })
    renderModal()

    const dialog = await screen.findByTestId('resellers-modal')
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('Other Resellers')
    await waitFor(() => expect(screen.getAllByRole('columnheader')).toHaveLength(4))
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual([
      'Owner',
      'Item Number',
      'Expiration Date',
      'Price'
    ])
  })

  it('renders each row with its issued number and seller, cheapest-first', async () => {
    fetchItemResales.mockResolvedValue([
      resale({ tradeId: 't-cheap', tokenId: '10', priceCredits: 12 }),
      resale({ tradeId: 't-mid', tokenId: '20', priceCredits: 30 })
    ])
    fetchResaleTokenInfos.mockResolvedValue({
      '10': { seller: '0xaaaa00000000000000000000000000000000aaaa', issuedId: '3' },
      '20': { seller: '0xbbbb00000000000000000000000000000000bbbb', issuedId: '9' }
    })
    renderModal()

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
    // The count line reports every open resale, not just the current page.
    expect(screen.getByTestId('resales-count').textContent).toBe('2 Resales')
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
    renderModal()

    const ownChip = await screen.findByTestId('resale-own')
    expect(ownChip.textContent).toMatch(/your listing/i)
    // Exactly one buyable row remains (the other seller); the own row has no Buy / Add-to-cart.
    await waitFor(() => expect(screen.getAllByTestId('resale-buy')).toHaveLength(1))
    const ownRow = ownChip.closest('[data-testid="resale-row"]') as HTMLElement
    expect(within(ownRow).queryByTestId('resale-buy')).toBeNull()
    expect(within(ownRow).queryByTestId('resale-add')).toBeNull()
  })

  it('adds a resale row to the cart with the item metadata backfilled', async () => {
    fetchItemResales.mockResolvedValue([resale({ tradeId: 't-1', tokenId: '10', priceCredits: 12, name: '' })])
    fetchResaleTokenInfos.mockResolvedValue({ '10': { seller: '0xaaaa', issuedId: '3' } })
    renderModal()

    await userEvent.click(await screen.findByTestId('resale-add'))
    expect(add).toHaveBeenCalledTimes(1)
    // Secondary rows carry no item name — it's backfilled from the PDP item before it hits the cart.
    expect(add.mock.calls[0][0]).toMatchObject({ tradeId: 't-1', name: 'Hat' })
    expect(add.mock.calls[0][1]).toBe('item_detail')
  })

  it('keeps legacy (MANA) rows Buy-only — never add-to-cart', async () => {
    fetchItemResales.mockResolvedValue([
      resale({ tradeId: 't-legacy', tokenId: '10', priceCredits: 12, source: 'legacy', manaWei: '1' })
    ])
    fetchResaleTokenInfos.mockResolvedValue({ '10': { seller: '0xaaaa', issuedId: '3' } })
    renderModal()

    const row = await screen.findByTestId('resale-row')
    expect(row.getAttribute('data-source')).toBe('legacy')
    expect(within(row).getByTestId('resale-buy')).toBeTruthy()
    expect(within(row).queryByTestId('resale-add')).toBeNull()
  })

  it('paginates ten rows per page', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      resale({ tradeId: `t${i}`, tokenId: String(i), priceCredits: 10 + i })
    )
    fetchItemResales.mockResolvedValue(many)
    fetchResaleTokenInfos.mockResolvedValue({})
    renderModal()

    // First page shows 10 rows; the pager reports two pages and prev is unavailable.
    await waitFor(() => expect(screen.getAllByTestId('resale-row')).toHaveLength(10))
    expect(screen.getByTestId('resale-page-label').textContent).toBe('Page 1 of 2')
    expect(screen.getByTestId('resale-prev-page').hasAttribute('disabled')).toBe(true)

    await userEvent.click(screen.getByTestId('resale-next-page'))

    // The remaining rows show on page two and next becomes unavailable.
    await waitFor(() => expect(screen.getAllByTestId('resale-row')).toHaveLength(2))
    expect(screen.getByTestId('resale-page-label').textContent).toBe('Page 2 of 2')
    expect(screen.getByTestId('resale-next-page').hasAttribute('disabled')).toBe(true)
  })

  it('sorts by most expensive and returns to page one', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      resale({ tradeId: `t${i}`, tokenId: String(i), priceCredits: 10 + i, issuedId: String(i) })
    )
    fetchItemResales.mockResolvedValue(many)
    fetchResaleTokenInfos.mockResolvedValue({})
    renderModal()

    await waitFor(() => expect(screen.getAllByTestId('resale-row')).toHaveLength(10))
    await userEvent.click(screen.getByTestId('resale-next-page'))
    await waitFor(() => expect(screen.getByTestId('resale-page-label').textContent).toBe('Page 2 of 2'))

    await userEvent.selectOptions(screen.getByTestId('resales-sort'), 'most_expensive')

    await waitFor(() => expect(screen.getByTestId('resale-page-label').textContent).toBe('Page 1 of 2'))
    const rows = screen.getAllByTestId('resale-row')
    expect(within(rows[0]).getByTestId('resale-issued').textContent).toBe('#11')
    expect(within(rows[9]).getByTestId('resale-issued').textContent).toBe('#2')
  })

  it('closes on the close button and on Escape', async () => {
    fetchItemResales.mockResolvedValue([resale({ tradeId: 't-1', tokenId: '10', priceCredits: 12 })])
    fetchResaleTokenInfos.mockResolvedValue({})
    renderModal()

    await userEvent.click(await screen.findByTestId('resellers-close'))
    expect(onClose).toHaveBeenCalledTimes(1)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows an empty state when nothing is on resale', async () => {
    fetchItemResales.mockResolvedValue([])
    fetchResaleTokenInfos.mockResolvedValue({})
    renderModal()

    expect((await screen.findByTestId('resales-empty')).textContent).toMatch(/no other copies/i)
    expect(screen.queryByTestId('resale-row')).toBeNull()
  })
})
