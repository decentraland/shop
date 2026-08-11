import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PurchaseRecord } from '~/lib/credits'
import type { PurchaseDisplay, SaleRecord } from '~/lib/api'
import type { ImportItem } from '~/lib/import'
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
const fetchUserCreditOrders = vi.fn()
const resumeCreditOrder = vi.fn()
// `creditOrderPill` is real: it is the mapping that decides what a row LOOKS like, and stubbing it
// would let the resume tests below agree with a fiction about which rows offer to be continued.
vi.mock('~/lib/credits', async importActual => {
  const actual = await importActual<typeof import('~/lib/credits')>()
  return {
    creditOrderPill: actual.creditOrderPill,
    fetchUserPurchases: (...args: unknown[]) => fetchUserPurchases(...args),
    fetchUserCreditOrders: (...args: unknown[]) => fetchUserCreditOrders(...args),
    resumeCreditOrder: (...args: unknown[]) => resumeCreditOrder(...args)
  }
})

const toastError = vi.fn()
const toastInfo = vi.fn()
const toastSuccess = vi.fn()
vi.mock('~/store/toast', () => ({
  toast: {
    error: (m: string) => toastError(m),
    info: (m: string) => toastInfo(m),
    success: (m: string) => toastSuccess(m)
  }
}))

const fetchTradeDisplay = vi.fn()
const fetchAssetDisplay = vi.fn()
const fetchUserSales = vi.fn()
const fetchUnified = vi.fn()
vi.mock('~/lib/api', () => ({
  fetchTradeDisplay: (...args: unknown[]) => fetchTradeDisplay(...args),
  fetchAssetDisplay: (...args: unknown[]) => fetchAssetDisplay(...args),
  fetchUserSales: (...args: unknown[]) => fetchUserSales(...args),
  fetchUnified: (...args: unknown[]) => fetchUnified(...args)
}))

// 1 MANA = $0.50 → 10 MANA = 50 credits.
const RATE: ManaRate = { rate: 50_000_000n, decimals: 8 }
const useManaRate = vi.fn()
vi.mock('~/hooks/useManaRate', () => ({
  useManaRate: (...args: unknown[]) => useManaRate(...args)
}))

const fetchImportable = vi.fn()
vi.mock('~/lib/import', () => ({
  fetchImportable: (...args: unknown[]) => fetchImportable(...args)
}))
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => true }))

// The migration tool is lazy-loaded and covered by its own spec; this one is about the chip that
// opens it and what replaces the feed when it does.
vi.mock('~/components/ImportListings', () => ({
  ImportListings: () => <div data-testid="import-panel" />
}))

import { Activity } from '~/pages/Activity'

function record(overrides: Partial<PurchaseRecord> = {}): PurchaseRecord {
  return {
    id: Math.random().toString(36).slice(2),
    tradeId: 't-' + Math.random().toString(36).slice(2),
    contractAddress: null,
    itemId: null,
    registeredName: null,
    usdCents: 100,
    credits: 10,
    status: 'SETTLED',
    createdAt: 1_700_000_000_000,
    manaSettledWei: null,
    txHash: null,
    submittedTxHash: null,
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

function renderPage(path = '/activity') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Activity />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// One classic (MANA-priced) listing, in the shape /v3/catalog/importable returns.
function importable(overrides: Partial<ImportItem> = {}): ImportItem {
  return {
    oldTradeId: 'old-' + Math.random().toString(36).slice(2),
    listingType: 'primary',
    contractAddress: '0xc0113c7104',
    itemId: '0',
    tokenId: null,
    name: 'Galaxy Hat',
    thumbnail: '',
    rarity: 'epic',
    category: 'wearable',
    wearableCategory: 'hat',
    manaWei: '100000000000000000000',
    available: 100,
    network: 'MATIC',
    chainId: 80002,
    suggestedCredits: 270,
    ...overrides
  }
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
  fetchUserCreditOrders.mockResolvedValue({ items: [], total: 0 })
  // Role-aware: /v1/sales is filtered by seller OR buyer server-side, and the page asks for both. A
  // role-blind mock would return the same row twice — once as a sale, once as a MANA purchase.
  fetchUserSales.mockImplementation(() => Promise.resolve({ items: [], total: 0 }))
  fetchTradeDisplay.mockResolvedValue(null)
  fetchAssetDisplay.mockResolvedValue(null)
  fetchImportable.mockResolvedValue({ creations: [], owned: [] })
  useManaRate.mockReturnValue({ data: RATE })
})

describe('when the user is not signed in', () => {
  it('should show the sign-in prompt and fetch nothing', () => {
    walletState.session = null
    renderPage()
    expect(screen.getByText('Sign in to see your activity')).toBeInTheDocument()
    expect(fetchUserPurchases).not.toHaveBeenCalled()
    expect(fetchUserSales).not.toHaveBeenCalled()
    // No seller, so there is nothing to ask about — the chip's read must not fire either.
    expect(fetchImportable).not.toHaveBeenCalled()
  })
})

describe('when the user has no activity', () => {
  it('should show the empty state', async () => {
    renderPage()
    expect(await screen.findByTestId('activity-empty-all')).toBeInTheDocument()
  })
})

/**
 * A NAME registration is the one purchase with no trade AND no item: it is not a collection item, and it
 * mints on Ethereum rather than the chain the credit settled on. Until the intent carried the name itself
 * there was nothing to resolve, and the feed showed a bare "Item" for the buyer's NAME.
 */
describe('when a NAME was registered', () => {
  beforeEach(() => {
    fetchUserPurchases.mockResolvedValue({
      items: [record({ id: 'n1', tradeId: null, registeredName: 'mauri', credits: 66, txHash: '0xname' })],
      total: 1
    })
  })

  it('should name the NAME instead of falling back to a generic item', async () => {
    renderPage()

    expect(await screen.findByText('@mauri')).toBeInTheDocument()
    expect(screen.queryByText('Item')).not.toBeInTheDocument()
  })

  it('should label the line as a NAME registration and show what it cost', async () => {
    renderPage()
    await screen.findByText('@mauri')

    const line = screen.getByTestId('activity-name-line')
    expect(line).toHaveTextContent('Decentraland NAME')
    expect(line).toHaveTextContent('66')
  })

  // There is no marketplace record behind a NAME, so asking for one would be a guaranteed miss — and a
  // pending lookup is what renders the skeleton the buyer would otherwise be left staring at.
  it('should not attempt to resolve it against the marketplace', async () => {
    renderPage()
    await screen.findByText('@mauri')

    expect(fetchTradeDisplay).not.toHaveBeenCalled()
    expect(fetchAssetDisplay).not.toHaveBeenCalled()
  })

  // The detail route needs a collection contract plus an id; a NAME has neither, so a link would be dead.
  it('should not link anywhere', async () => {
    renderPage()
    await screen.findByText('@mauri')

    expect(screen.getByTestId('activity-name-line').querySelector('a')).toBeNull()
    expect(screen.getByTestId('activity-name-line').closest('a')).toBeNull()
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

/**
 * A purchase that was submitted and reverted. Before this it was dropped from the feed entirely, alongside
 * the reservations nobody ever spent — so the buyer's failed purchase simply vanished, their credits came
 * back minutes later, and nothing connected the two.
 */
describe('when a purchase was submitted and failed', () => {
  it('should render it as FAILED, not completed', async () => {
    fetchUserPurchases.mockResolvedValue({
      items: [record({ id: 'f', tradeId: 't1', status: 'EXPIRED', submittedTxHash: '0xattempt', credits: 12 })],
      total: 1
    })
    fetchTradeDisplay.mockResolvedValue(display({ name: 'Crimson Heels', itemId: '1' }))
    renderPage()

    await screen.findByTestId('purchase-order')
    expect(screen.getByText('Failed')).toBeInTheDocument()
    // The regression: an expired order used to fall through the status ternary's else branch.
    expect(screen.queryByText('Completed')).not.toBeInTheDocument()
  })

  it('should say the buyer was not charged and their credits came back', async () => {
    fetchUserPurchases.mockResolvedValue({
      items: [record({ id: 'f', tradeId: 't1', status: 'EXPIRED', submittedTxHash: '0xattempt' })],
      total: 1
    })
    fetchTradeDisplay.mockResolvedValue(display({ name: 'Crimson Heels', itemId: '1' }))
    renderPage()

    await screen.findByTestId('purchase-order')
    // "Failed" on its own leaves the buyer wondering where the money went; this is the half that answers it.
    expect(screen.getByText(/credits are back in your balance/i)).toBeInTheDocument()
  })

  it('should still hide an expired reservation nobody ever submitted', async () => {
    fetchUserPurchases.mockResolvedValue({
      items: [record({ id: 'n', tradeId: 't1', status: 'EXPIRED', submittedTxHash: null })],
      total: 1
    })
    renderPage()

    // Every opened buy modal leaves one of these. Showing them would invent a history of failures.
    await waitFor(() => expect(screen.queryByTestId('purchase-order')).not.toBeInTheDocument())
  })

  it('should not show the note on a completed purchase', async () => {
    fetchUserPurchases.mockResolvedValue({
      items: [record({ id: 's', tradeId: 't1', status: 'SETTLED', txHash: '0xok' })],
      total: 1
    })
    fetchTradeDisplay.mockResolvedValue(display({ name: 'Crimson Heels', itemId: '1' }))
    renderPage()

    await screen.findByTestId('purchase-order')
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.queryByText(/credits are back in your balance/i)).not.toBeInTheDocument()
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

// A CollectionStore mint has no trade. Resolving a purchase line only through its tradeId rendered every
// mint as the nameless "Item" fallback above, with no link to its detail page.
describe('when a purchase line is a mint with no trade', () => {
  const COLLECTION = '0x3b5306be0da3202a5e7b00d1acc16a46cd88dfdc'

  it('should resolve its name from the recorded item instead of a trade', async () => {
    fetchUserPurchases.mockResolvedValue({
      items: [record({ id: 'a', tradeId: null, contractAddress: COLLECTION, itemId: '12', txHash: '0xz', credits: 3 })],
      total: 1
    })
    fetchAssetDisplay.mockResolvedValue(display({ name: 'Banana Crown', contractAddress: COLLECTION, itemId: '12' }))

    renderPage()

    expect(await screen.findByText('Banana Crown')).toBeInTheDocument()
    expect(screen.queryByText('Item')).not.toBeInTheDocument()
    // Resolved by item, never by trade — there is no trade to ask about.
    expect(fetchAssetDisplay).toHaveBeenCalledWith(COLLECTION, { itemId: '12' })
    expect(fetchTradeDisplay).not.toHaveBeenCalled()
  })

  it('should still fall back to the generic name when the item cannot be resolved', async () => {
    fetchUserPurchases.mockResolvedValue({
      items: [record({ id: 'a', tradeId: null, contractAddress: COLLECTION, itemId: '12', txHash: '0xz', credits: 3 })],
      total: 1
    })
    fetchAssetDisplay.mockResolvedValue(null)

    renderPage()

    expect(await screen.findByText('Item')).toBeInTheDocument()
  })

  // The rows written before the server recorded the item: nothing to resolve, and nothing to crash on.
  it('should render a line with neither a trade nor an item as the generic fallback', async () => {
    fetchUserPurchases.mockResolvedValue({
      items: [record({ id: 'a', tradeId: null, txHash: '0xz', credits: 3 })],
      total: 1
    })

    renderPage()

    expect(await screen.findByText('Item')).toBeInTheDocument()
    expect(fetchAssetDisplay).not.toHaveBeenCalled()
    expect(fetchTradeDisplay).not.toHaveBeenCalled()
  })
})

describe('when purchases and a sale are interleaved', () => {
  beforeEach(() => {
    fetchUserPurchases.mockResolvedValue({
      items: [record({ id: 'a', tradeId: 't1', txHash: '0xcart1', credits: 12, createdAt: 1_700_000_000_000 })],
      total: 1
    })
    fetchTradeDisplay.mockResolvedValue(display({ name: 'Purchased Thing' }))
    fetchUserSales.mockImplementation((_addr: unknown, opts?: { role?: string }) =>
      Promise.resolve(
        opts?.role === 'buyer' ? { items: [], total: 0 } : { items: [sale({ createdAt: 1_700_000_500_000 })], total: 1 }
      )
    )
    fetchAssetDisplay.mockResolvedValue(display({ name: 'Sold Thing', tokenId: '42', itemId: undefined }))
  })

  it('should show both a purchase card and a sale card in the "all" feed', async () => {
    renderPage()
    await screen.findByText('Purchased Thing')
    expect(screen.getByTestId('purchase-order')).toBeInTheDocument()
    expect(screen.getByTestId('activity-sale')).toBeInTheDocument()
    // The sale shows its "Sold" pill, the counterparty account, and the MANA it settled in (10, with the
    // MANA symbol) — sales pay MANA, not credits.
    expect(screen.getByText('Sold')).toBeInTheDocument()
    expect(screen.getByText(/Sold to 0xb0b0/)).toBeInTheDocument()
    const saleCard = screen.getByTestId('activity-sale')
    expect(saleCard.textContent ?? '').toContain('10')
    expect(saleCard.querySelector('img[alt="MANA"]')).not.toBeNull()
  })

  it('should hide purchases when the Sales filter is selected', async () => {
    renderPage()
    await screen.findByText('Sold Thing')
    fireEvent.click(screen.getByTestId('activity-filter-sales'))
    await waitFor(() => expect(screen.queryByTestId('purchase-order')).not.toBeInTheDocument())
    expect(screen.getByTestId('activity-sale')).toBeInTheDocument()
  })
})

describe('the migration chip', () => {
  // A default per test, because clearAllMocks resets calls but keeps implementations: without this, the
  // never-resolving promise one test installs to hold a count open leaks into the next one.
  beforeEach(() => {
    fetchUnified.mockReset().mockResolvedValue({ items: [], total: 0 })
    fetchImportable.mockReset()
  })

  it('should not render at all when the seller has no listings of any kind', async () => {
    renderPage()
    await screen.findByTestId('activity-empty-all')

    expect(screen.queryByTestId('activity-filter-migrate')).not.toBeInTheDocument()
    // Not even an unbadged chip: the row is the three filters and nothing else.
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('should render nothing while the count is still unknown', async () => {
    fetchImportable.mockReturnValue(new Promise(() => {}))
    renderPage()
    await screen.findByTestId('activity-empty-all')

    expect(screen.queryByTestId('activity-filter-migrate')).not.toBeInTheDocument()
    expect(screen.queryByTestId('activity-migrate-count')).not.toBeInTheDocument()
  })

  // Both answers, not either: with one still in flight the chip would otherwise pop in the moment the
  // second landed, which is the flash the whole "undefined until known" dance exists to prevent.
  it('should render nothing while EITHER count is still in flight', async () => {
    fetchImportable.mockResolvedValue({ creations: [importable()], owned: [] })
    fetchUnified.mockReturnValue(new Promise(() => {}))
    renderPage()
    await screen.findByTestId('activity-empty-all')

    expect(screen.queryByTestId('activity-filter-migrate')).not.toBeInTheDocument()
  })

  it('should render at the end of the chip row, badged with how many are left', async () => {
    fetchImportable.mockResolvedValue({ creations: [importable(), importable()], owned: [importable()] })
    renderPage()

    const chip = await screen.findByTestId('activity-filter-migrate')
    expect(chip).toHaveTextContent('Listings')
    expect(screen.getByTestId('activity-migrate-count')).toHaveTextContent('3')
    // Last of the four chips.
    expect(screen.getAllByRole('tab').at(-1)).toBe(chip)
    // The count is spelled out for a reader, since the badge alone says "3" of nothing.
    expect(chip).toHaveAccessibleName('Move your listings — 3 items left')
  })

  it('should read the count ONCE for a render pass, not per render', async () => {
    fetchImportable.mockResolvedValue({ creations: [importable()], owned: [] })
    const { rerender } = renderPage()
    await screen.findByTestId('activity-filter-migrate')

    rerender(<div />)
    expect(fetchImportable).toHaveBeenCalledTimes(1)
  })

  // The point of the change: the section is about HAVING listings, so a seller who already moved every
  // one of them can still open it — and reach the "all set" state written for exactly them. Gated on the
  // migratable count alone, that state was unreachable.
  it('should render for a seller whose listings are all migrated already', async () => {
    fetchImportable.mockResolvedValue({ creations: [], owned: [] })
    fetchUnified.mockResolvedValue({ items: [], total: 4 })
    renderPage()

    const chip = await screen.findByTestId('activity-filter-migrate')
    expect(chip).toHaveTextContent('Listings')
    // No badge: nothing is outstanding, and a "0" would read as work to do.
    expect(screen.queryByTestId('activity-migrate-count')).not.toBeInTheDocument()
  })

  it('should keep the badge counting only what is left to move, not every listing', async () => {
    fetchImportable.mockResolvedValue({ creations: [importable()], owned: [] })
    fetchUnified.mockResolvedValue({ items: [], total: 9 })
    renderPage()

    await screen.findByTestId('activity-filter-migrate')
    expect(screen.getByTestId('activity-migrate-count')).toHaveTextContent('1')
  })

  it('should swap the feed for the migration tool when clicked', async () => {
    fetchImportable.mockResolvedValue({ creations: [importable()], owned: [] })
    renderPage()

    fireEvent.click(await screen.findByTestId('activity-filter-migrate'))

    expect(await screen.findByTestId('import-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('activity-empty-all')).not.toBeInTheDocument()
    expect(screen.getByTestId('activity-filter-migrate')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('activity-filter-all')).toHaveAttribute('aria-selected', 'false')
  })

  // What /import redirects to, so the redirect lands on the tool rather than on the feed.
  it('should open the tool straight away from the view query', async () => {
    fetchImportable.mockResolvedValue({ creations: [importable()], owned: [] })
    renderPage('/activity?view=migrate')

    expect(await screen.findByTestId('import-panel')).toBeInTheDocument()
    expect(await screen.findByTestId('activity-filter-migrate')).toHaveAttribute('aria-selected', 'true')
  })

  /**
   * `?section=listings` is the link handed to creators, and `?view=migrate` is what shipped first. Both
   * have to open the tool: renaming without keeping the old one would send every link already pasted in a
   * chat to the feed instead, which looks like the page simply ignoring the link.
   */
  describe('and the section is addressed by its shareable name', () => {
    it('should open the tool from ?section=listings', async () => {
      fetchImportable.mockResolvedValue({ creations: [importable()], owned: [] })
      renderPage('/activity?section=listings')

      expect(await screen.findByTestId('import-panel')).toBeInTheDocument()
      expect(await screen.findByTestId('activity-filter-migrate')).toHaveAttribute('aria-selected', 'true')
    })

    it('should still open the tool from the original ?view=migrate', async () => {
      fetchImportable.mockResolvedValue({ creations: [importable()], owned: [] })
      renderPage('/activity?view=migrate')

      expect(await screen.findByTestId('import-panel')).toBeInTheDocument()
    })

    it('should leave the section when a filter chip is picked, even arriving by the legacy link', async () => {
      // Both spellings are cleared on exit, or a legacy arrival would keep re-opening the tool.
      fetchImportable.mockResolvedValue({ creations: [importable()], owned: [] })
      renderPage('/activity?view=migrate')
      await screen.findByTestId('import-panel')

      fireEvent.click(screen.getByTestId('activity-filter-purchases'))

      await waitFor(() => expect(screen.queryByTestId('import-panel')).not.toBeInTheDocument())
    })
  })

  it('should keep the chip while its own panel is open even with nothing left to move', async () => {
    // Both counts have to ANSWER — zero, but answered. The chip waits for them even in its own view, so
    // an unanswered count is not "nothing left to move", it is "not yet".
    fetchImportable.mockResolvedValue({ creations: [], owned: [] })
    renderPage('/activity?view=migrate')

    const chip = await screen.findByTestId('activity-filter-migrate')
    // Present so the row still has a selected chip, but with no zero badge on it.
    expect(chip).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByTestId('activity-migrate-count')).not.toBeInTheDocument()
    // No count to spell out, so the name falls back to the chip's own label.
    expect(chip).toHaveAccessibleName('Listings')
  })

  it('should go back to the feed when a filter chip is picked', async () => {
    fetchImportable.mockResolvedValue({ creations: [importable()], owned: [] })
    renderPage('/activity?view=migrate')
    await screen.findByTestId('import-panel')

    fireEvent.click(screen.getByTestId('activity-filter-purchases'))

    await waitFor(() => expect(screen.queryByTestId('import-panel')).not.toBeInTheDocument())
    expect(screen.getByTestId('activity-filter-purchases')).toHaveAttribute('aria-selected', 'true')
  })

  it('should not read the feed while the migration tool is what is on screen', async () => {
    fetchImportable.mockResolvedValue({ creations: [importable()], owned: [] })
    renderPage('/activity?view=migrate')
    await screen.findByTestId('import-panel')

    expect(fetchUserPurchases).not.toHaveBeenCalled()
    expect(fetchUserSales).not.toHaveBeenCalled()
  })
})

// The Continue button on an unfinished checkout. It is a button on the money path whose every branch
// either sends the buyer to a payment page or tells them something about a charge, so each answer the
// server can give gets its own case.
describe('when a checkout was left unfinished', () => {
  const unfinished = {
    id: 'ord_1',
    credits: 50,
    usdCents: 500,
    status: 'initiated' as const,
    createdAt: 1_700_000_000_000
  }
  const realLocation = window.location

  beforeEach(() => {
    fetchUserCreditOrders.mockResolvedValue({ items: [unfinished], total: 1 })
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { href: '' } })
  })
  afterAll(() => {
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: realLocation })
  })

  async function clickResume() {
    const button = await screen.findByTestId('resume-order')
    fireEvent.click(button)
    return button
  }

  it('should offer to continue it, and send the buyer back to the Stripe page', async () => {
    resumeCreditOrder.mockResolvedValue({ kind: 'url', url: 'https://checkout.stripe.com/c/pay/cs_test' })
    renderPage()

    await clickResume()

    await waitFor(() => expect(window.location.href).toBe('https://checkout.stripe.com/c/pay/cs_test'))
  })

  // `location.href` will happily run a `javascript:` URL, and this string comes off the wire. A
  // response that is compromised or simply wrong must not turn a button in the buyer's own history
  // into script execution.
  it('should refuse a url that is not a Stripe page and go nowhere', async () => {
    resumeCreditOrder.mockResolvedValue({ kind: 'url', url: 'https://stripe.com.evil.example/pay' })
    renderPage()

    await clickResume()

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(window.location.href).toBe('')
  })

  // The server retired it. Refreshing the feed is what tells the buyer — an error about something
  // they cannot act on would not.
  it('should refresh the feed when the checkout turned out to be dead', async () => {
    resumeCreditOrder.mockResolvedValue({ kind: 'expired' })
    fetchUserCreditOrders.mockResolvedValueOnce({ items: [unfinished], total: 1 })
    renderPage()

    await clickResume()

    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith('That checkout has expired — pick a pack to start again.')
    )
    await waitFor(() => expect(fetchUserCreditOrders.mock.calls.length).toBeGreaterThan(1))
  })

  // The one that matters most: telling a buyer who already paid to "start again" invites a second
  // charge for something they own.
  it('should never suggest starting over to someone who already paid', async () => {
    resumeCreditOrder.mockResolvedValue({ kind: 'paid' })
    renderPage()

    await clickResume()

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('You already paid for this — your credits are on the way.')
    )
    expect(window.location.href).toBe('')
  })

  it('should ask the server once even if the button is pressed twice', async () => {
    let release: (v: unknown) => void = () => {}
    resumeCreditOrder.mockReturnValue(new Promise(resolve => (release = resolve)))
    renderPage()

    const button = await clickResume()
    fireEvent.click(button)

    expect(resumeCreditOrder).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    release({ kind: 'unavailable' })
  })

  // Leaving for Stripe deliberately keeps the button disabled on the way out. Pressing Back brings
  // this component back from bfcache with that state intact, and without the reset the buyer returns
  // to a Continue button stuck on "Opening…" until a hard reload.
  it('should become pressable again when the buyer comes back from Stripe', async () => {
    resumeCreditOrder.mockResolvedValue({ kind: 'url', url: 'https://checkout.stripe.com/c/pay/cs_test' })
    renderPage()

    const button = await clickResume()
    await waitFor(() => expect(button).toBeDisabled())

    window.dispatchEvent(new Event('pageshow'))

    await waitFor(() => expect(button).not.toBeDisabled())
  })
})
