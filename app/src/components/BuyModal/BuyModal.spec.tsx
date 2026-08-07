import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'

/**
 * THE RELEASE DECISION in the PDP buy flow.
 *
 * This modal releases its reservation from six different places, and three of them can run AFTER the
 * transaction has gone out. Releasing a credit that is consumed on-chain hands the buyer back money they have
 * already spent: the balance rises, the reconciler debits it again once the squid indexes the consumption, and
 * anything they buy in that gap drives the balance negative.
 *
 * There was no spec for this component at all, which is how the defect survived — the equivalent bug in the
 * cart shipped twice for exactly that reason. The tests drive the real flow (`resume` auto-confirms after the
 * price lock) and assert on what `cancelUsdIntents` is called with, never on internals.
 */

const session = {
  address: '0xbuyer000000000000000000000000000000000001',
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: { authChain: [] } as never,
  providerType: 'injected' as never
}
vi.mock('~/store/wallet', () => ({ useWallet: () => ({ session }) }))

// The completed state fires the confetti, which lazy-loads lottie-web — a canvas/rAF runtime that throws on
// import under jsdom, taking the Suspense subtree (and the CTAs asserted below) with it.
vi.mock('lottie-react', () => ({ default: () => <span data-testid="lottie" /> }))

// decentraland-ui2 pulls @dcl/hooks, another ESM directory import (same workaround as GetCredits.spec.tsx).
vi.mock('decentraland-ui2', () => ({
  CircularProgress: ({ size }: { size?: number }) => <span role="progressbar" data-size={size} />
}))

// decentraland-transactions ships an ESM directory import vitest's resolver cannot follow.
vi.mock('decentraland-transactions', () => ({
  ContractName: { CreditsManager: 'CreditsManager', MANAToken: 'MANAToken' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: (name: string) => ({ address: `0x${name}`, name, version: '1', abi: [] })
}))

// Plenty of credits and no MANA: the credits rail is the only one on the table, so `resume` confirms it.
// Mutable, defaulting to the plentiful balance every existing test here assumes — only the shortfall
// (`nofunds`) cases lower it.
const balance = { data: { balanceCents: 100_000, credits: 10_000 } }
vi.mock('~/hooks/useBalance', () => ({ useBalance: () => balance }))

// Mutable so both sides of the iOS web-view gate are reachable.
const iap = { on: false }
vi.mock('~/lib/iap', () => ({ isIapMode: () => iap.on }))
vi.mock('~/hooks/useManaBalance', () => ({ useManaBalance: () => ({ data: 0n }) }))
// Mutable and empty by default, as every test here had it. The shortfall cases need real packs: `goNoFunds`
// picks a covering pack and reads `cover.id`, so an empty catalogue throws there and the modal lands in
// `error` instead of the pack picker.
const creditPacks: { packs: { id: string; credits: number; usd: number }[] } = { packs: [] }
vi.mock('~/hooks/useCreditPacks', () => ({ useCreditPacks: () => creditPacks }))

const { authorizeUsdCredit, cancelUsdIntents } = vi.hoisted(() => ({
  authorizeUsdCredit: vi.fn(),
  cancelUsdIntents: vi.fn()
}))
vi.mock('~/lib/credits', () => ({ authorizeUsdCredit, cancelUsdIntents, getUsdBalance: vi.fn() }))

// The seam under test: a driver that reports outcomes through the real callbacks.
const { buyOneWithCredits } = vi.hoisted(() => ({ buyOneWithCredits: vi.fn() }))
vi.mock('~/lib/buy', () => ({ buyOneWithCredits }))
// Only the SUBMIT functions are stubbed: the pure helpers that decide what a purchase settles as are the real
// ones, so a test asserting on what reaches the buy rail is asserting on what production would build.
vi.mock('~/lib/buy-mana', async orig => ({
  ...(await orig<Record<string, unknown>>()),
  buyWithMana: vi.fn(),
  buyMintWithMana: vi.fn(),
  buyWithCreditsAndMana: vi.fn(),
  buyMintWithCreditsAndMana: vi.fn()
}))
// The gasless rail is the production default, so it has to be drivable rather than hard-mocked off.
const { buyOneGasless, waitForSettlement, gaslessOn, GaslessUnavailable, SettlementPending } = vi.hoisted(() => ({
  buyOneGasless: vi.fn(),
  waitForSettlement: vi.fn(),
  gaslessOn: { value: false },
  GaslessUnavailable: class GaslessUnavailableError extends Error {
    reason: string
    constructor(message: string, reason = 'unknown') {
      super(message)
      this.reason = reason
    }
  },
  SettlementPending: class SettlementPendingError extends Error {}
}))
vi.mock('~/lib/gasless-config', () => ({ gaslessEnabled: () => gaslessOn.value }))
vi.mock('~/lib/buy-gasless', () => ({
  buyOneGasless,
  waitForSettlement,
  GaslessUnavailableError: GaslessUnavailable,
  SettlementPendingError: SettlementPending
}))

const { resolveLiveTrade, fetchStoreMintState } = vi.hoisted(() => ({
  resolveLiveTrade: vi.fn(),
  // The live mint read a store item resolves through, the counterpart to resolving a trade.
  fetchStoreMintState: vi.fn()
}))
vi.mock('~/lib/api', async orig => ({
  ...(await orig<Record<string, unknown>>()),
  resolveLiveTrade,
  fetchStoreMintState
}))
vi.mock('~/lib/mana', () => ({ readTradeManaPriceWei: vi.fn(async () => 0n) }))
vi.mock('~/lib/mana-rate', () => ({
  readManaUsdRate: vi.fn(async () => ({ rate: 50_000_000n, decimals: 8 })),
  manaWeiToUsdCents: () => 0
}))
vi.mock('~/lib/ownership', () => ({ isOwnTrade: () => false }))
vi.mock('~/lib/authorizations', () => ({
  getAuthorizationStatus: vi.fn(),
  getManaSpendingAuthorization: vi.fn(),
  needsApprovalStep: () => false
}))
vi.mock('~/lib/after-purchase', () => ({ invalidateAfterPurchase: vi.fn() }))
vi.mock('~/lib/payments', () => ({ createPackCheckout: vi.fn(), MAX_OFFER_PACKS: 3 }))

const { track, captureError } = vi.hoisted(() => ({ track: vi.fn(), captureError: vi.fn() }))
vi.mock('~/lib/analytics', async orig => ({ ...(await orig<Record<string, unknown>>()), track }))
vi.mock('~/lib/monitoring', () => ({ captureError }))

const { BuyModal } = await import('~/components/BuyModal')

const item = {
  id: 'item-1',
  name: 'Nebula Jacket',
  creator: '0xcreator',
  contractAddress: '0xcontract',
  itemId: '1',
  category: 'wearable',
  rarity: 'epic',
  network: 'MATIC',
  chainId: 80002,
  thumbnail: '',
  priceCredits: 270,
  tradeId: 'trade-1'
} as unknown as CatalogItem

// `resume` makes the modal confirm as soon as the price locks — the same call the Buy CTA makes, without
// depending on button copy.
function Location() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{`${pathname}${search}`}</span>
}

function renderModal({ resume, over }: { resume: boolean; over?: Partial<CatalogItem> }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BuyModal item={{ ...item, ...over }} onClose={vi.fn()} resume={resume} />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// resume=true confirms as soon as the price locks — the same call the Buy CTA makes.
const renderResuming = (over?: Partial<CatalogItem>) => renderModal({ resume: true, over })
// resume=false locks the price and then waits for the buyer, which is the only way to reach the state the
// unmount cleanup exists for: a reservation that was never submitted.
const renderIdle = () => renderModal({ resume: false })

beforeEach(() => {
  vi.clearAllMocks()
  cancelUsdIntents.mockResolvedValue(0)
  resolveLiveTrade.mockResolvedValue({
    id: 'trade-1',
    chainId: 80002,
    contract: '0xmarket',
    signer: '0xseller',
    received: [{ assetType: 2, amount: (2700n * 10n ** 16n).toString() }]
  })
  authorizeUsdCredit.mockResolvedValue({
    credit: { id: 'credit-1' },
    maxCreditedValue: '1000000000000000000',
    usdCents: 2700
  })
  buyOneWithCredits.mockResolvedValue('0xhash')
  gaslessOn.value = false
  waitForSettlement.mockResolvedValue(undefined)
})

describe('when the buy fails after the transaction was broadcast', () => {
  it('should NOT release the reservation', async () => {
    // No receipt to read (a replaced or dropped transaction), so the outcome is unknown and the credit may
    // well be consumed. The pessimistic side is the only safe one.
    buyOneWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast' })
      throw new Error('transaction was replaced')
    })

    renderResuming()

    await waitFor(() => expect(track).toHaveBeenCalledWith('Shop Purchase Failed', expect.anything()))
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should release when the transaction reverted, because nothing was consumed', async () => {
    buyOneWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast' })
      // The revert carries ITS hash: one credit can back more than one transaction, so "a revert happened" is
      // not the same statement as "this credit is untouched".
      opts.onReverted?.({ txHash: '0xbroadcast' })
      throw new Error('transaction failed')
    })

    renderResuming()

    // Releasing is not merely allowed here, it is required: otherwise that much of the buyer's balance is
    // stranded until the TTL expires.
    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
  })

  it('should still release when nothing was broadcast', async () => {
    // The pre-existing behaviour, which must not regress: a rejected signature spends nothing.
    buyOneWithCredits.mockRejectedValue(new Error('user rejected transaction'))

    renderResuming()

    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
  })
})

/**
 * The path that needed no race: `track` and `invalidateAfterPurchase` used to sit inside the buy's `try`, so
 * any throw from them — a Segment fault, a bad query key — landed in the catch and released a credit consumed
 * seconds earlier. A completed purchase must also still LOOK completed.
 */
describe('when post-purchase bookkeeping throws', () => {
  it('should keep the purchase complete and release nothing', async () => {
    buyOneWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast' })
      return '0xhash'
    })
    track.mockImplementation((event: string) => {
      if (event === 'Shop Completed Purchase') throw new Error('segment blew up')
    })

    renderResuming()

    expect(await screen.findByText(/purchase complete/i)).toBeInTheDocument()
    expect(cancelUsdIntents).not.toHaveBeenCalled()
    expect(captureError).toHaveBeenCalled()
  })
})

/**
 * The success CTA promises the item is "in the My Items tab", so it has to actually go there. It used to
 * navigate to `/items?tab=mine` — a route that ignores the param, dropping the buyer on the public
 * Collectibles grid.
 */
describe('the post-purchase My Items CTA', () => {
  const clickMyItems = async () => {
    expect(await screen.findByText(/purchase complete/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /my items/i }))
    return screen.getByTestId('location').textContent
  }

  it('should take the buyer to My Items, not the browse grid', async () => {
    renderResuming()
    expect(await clickMyItems()).toBe('/my-items?section=wearables')
  })

  it('should land on the shelf the purchase is actually on', async () => {
    // My Items opens on Wearables, so an emote buyer used to arrive somewhere their emote could not be.
    renderResuming({ category: 'emote' })
    expect(await clickMyItems()).toBe('/my-items?section=emotes')
  })
})

/**
 * The third release site: the effect cleanup on unmount.
 *
 * `reservedCreditIdRef` is only cleared once the buy resolves, so closing the modal (or navigating away) with
 * a transaction in flight used to reach `cancelUsdIntents` with a credit that was already on its way.
 */
describe('when the modal unmounts with a transaction in flight', () => {
  it('should not release a reservation whose transaction was broadcast', async () => {
    buyOneWithCredits.mockImplementation(
      (opts: Record<string, any>) =>
        new Promise(() => {
          opts.onBroadcast?.({ txHash: '0xbroadcast' })
        })
    )

    const { unmount } = renderResuming()
    await waitFor(() => expect(buyOneWithCredits).toHaveBeenCalled())
    unmount()

    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  /**
   * The window the broadcast report cannot cover: the wallet prompt is open, so nothing has been reported yet,
   * but the buyer is one click away from spending the credit. Releasing here and having them then confirm is
   * the same corruption, arrived at from the other side.
   */
  it('should not release while the submit is still in flight, before any broadcast', async () => {
    buyOneWithCredits.mockImplementation(() => new Promise(() => {}))

    const { unmount } = renderResuming()
    await waitFor(() => expect(buyOneWithCredits).toHaveBeenCalled())
    unmount()

    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should release a reservation that was never submitted', async () => {
    // Price locked, buyer walked away without pressing Buy. THE case the cleanup exists for — otherwise every
    // abandoned modal strands that much of the balance for the whole TTL.
    //
    // The previous version of this test used `resume`, which auto-confirms: it asserted a release while a
    // submit was in flight, i.e. it codified the unsafe half of the very bug being fixed.
    const { unmount } = renderIdle()
    await waitFor(() => expect(authorizeUsdCredit).toHaveBeenCalled())
    expect(buyOneWithCredits).not.toHaveBeenCalled()
    unmount()

    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
  })
})

/**
 * NOT TESTED HERE, deliberately: the retry-with-the-same-reservation scenario.
 *
 * This modal's error phase offers only Close — there is no retry CTA — so a second attempt against the same
 * locked credit is not reachable through the UI. `MarketCheckout` DOES leave its Confirm CTA enabled on the
 * error phase, and that is where the case is exercised. The protection is shared: both components key the
 * broadcast state per credit AND per transaction hash (lib/spend-guard), so an unresolved first attempt keeps
 * the credit untouchable no matter how a second attempt ends.
 *
 * The remaining way to reach two attempts here is concurrency — `startPurchase` awaits an RPC read without
 * flipping the phase, so the MANA/combined CTA stays clickable. The guard handles the release correctly
 * (each attempt carries its own credit id), but nothing stops the duplicate submit itself. Left as a
 * follow-up: it costs the buyer gas on a transaction that will revert, which is a different defect from
 * handing back money they already spent.
 */
describe('when buying through the relayer', () => {
  it('should NOT release while a relayed transaction may still land', async () => {
    gaslessOn.value = true
    buyOneGasless.mockResolvedValue('0xrelayed')
    waitForSettlement.mockRejectedValue(new SettlementPending('still pending'))

    renderResuming()

    // Pending is not a failure: the reconciler settles it against the indexed CreditUsed event.
    expect(await screen.findByText(/purchase complete/i)).toBeInTheDocument()
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should release when the relayed transaction reverted', async () => {
    gaslessOn.value = true
    buyOneGasless.mockResolvedValue('0xrelayed')
    // waitForSettlement throws a plain Error only for a status-0 receipt: nothing was consumed.
    waitForSettlement.mockRejectedValue(new Error('transaction reverted'))

    renderResuming()

    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
  })

  it('should fall back to the direct rail when the relayer REFUSED', async () => {
    gaslessOn.value = true
    // A parsed rejection proves nothing was relayed, so re-using the credit is safe.
    buyOneGasless.mockRejectedValue(new GaslessUnavailable('relayer 400', 'relayer-rejected'))

    renderResuming()

    await waitFor(() => expect(buyOneWithCredits).toHaveBeenCalled())
    expect(await screen.findByText(/purchase complete/i)).toBeInTheDocument()
  })

  /**
   * THE P1. An unreachable relayer is not a refusal: it may have submitted before the connection died, and
   * there is no hash to key a later revert on. Re-submitting the same credit would estimate gas against an
   * already-consumed credit, revert with no receipt, and look exactly like a pre-broadcast failure.
   */
  it('should neither re-submit nor release when the relayer was unreachable', async () => {
    gaslessOn.value = true
    buyOneGasless.mockRejectedValue(new GaslessUnavailable('ECONNRESET', 'relayer-unreachable'))

    renderResuming()

    await waitFor(() => expect(track).toHaveBeenCalledWith('Shop Purchase Failed', expect.anything()))
    expect(buyOneWithCredits).not.toHaveBeenCalled()
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })
})

/**
 * The shortfall state is where the Shop sells credits: a pack picker, a running total and a Buy button,
 * right inside the buy modal. Inside the iOS app's web view that whole sale has to go — Apple requires
 * digital currency to be sold through In-App Purchase, and the app does it.
 *
 * What must NOT go is the explanation. The buyer still needs to be told what they are short by and be able
 * to close; they top up in the app and come back.
 */
describe('when the buyer is short on credits', () => {
  const LOW = { data: { balanceCents: 50, credits: 5 } }
  const PLENTY = { data: { balanceCents: 100_000, credits: 10_000 } }

  beforeEach(() => {
    balance.data = LOW.data
    creditPacks.packs = [
      { id: 'p1', credits: 100, usd: 10 },
      { id: 'p2', credits: 500, usd: 50 }
    ]
  })

  afterEach(() => {
    balance.data = PLENTY.data
    creditPacks.packs = []
    iap.on = false
  })

  it('should offer the credit packs on the web', async () => {
    renderIdle()

    expect(await screen.findByTestId('credit-packs')).toBeInTheDocument()
  })

  describe('and the shop is running in the iOS web view', () => {
    beforeEach(() => {
      iap.on = true
    })

    it('should not offer the credit packs', async () => {
      renderIdle()

      // The warning is what marks the phase as reached — asserting on its absence alone would pass even if
      // the modal never got here.
      await screen.findByText(/insufficient/i)
      expect(screen.queryByTestId('credit-packs')).not.toBeInTheDocument()
    })

    it('should still say what the buyer is short by, and let them close', async () => {
      renderIdle()

      await screen.findByText(/insufficient/i)
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })
  })
})

/**
 * Buying a CollectionStore MINT through this modal.
 *
 * A mint has no trade and never gets one, so every step that used to assume `accept([trade])` had to learn the
 * other rail. These pin that the modal reaches the STORE with the price the chain will verify, and that the
 * purchase intent still records what was bought — a mint's only identity, since it has no tradeId to name.
 */
describe('when the item is a CollectionStore mint', () => {
  const TEN_MANA = (10n * 10n ** 18n).toString()
  const mintItem: Partial<CatalogItem> = {
    acquisition: 'store',
    tradeId: undefined,
    contractAddress: '0xcollection',
    itemId: '7',
    available: 4
  }

  beforeEach(() => {
    // 1 MANA = $0.50 at 8 decimals, so 10 MANA = $5.00 = 50 credits.
    fetchStoreMintState.mockResolvedValue({ priceWei: TEN_MANA, available: 4 })
    // The trade resolver must never be consulted for a mint — there is nothing to resolve.
    resolveLiveTrade.mockRejectedValue(new Error('no trade for a mint'))
  })

  it('should settle through the store, at the live price the contract will verify', async () => {
    renderResuming(mintItem)

    await waitFor(() => expect(buyOneWithCredits).toHaveBeenCalled())
    const { purchase } = buyOneWithCredits.mock.calls[0][0]
    expect(purchase.kind).toBe('store')
    expect(purchase.item).toEqual({ collection: '0xcollection', itemId: '7', priceWei: TEN_MANA })
    expect(purchase.credits).toEqual([{ id: 'credit-1' }])
  })

  it('should authorize with no tradeId but WITH what is being bought', async () => {
    renderResuming(mintItem)

    await waitFor(() => expect(authorizeUsdCredit).toHaveBeenCalled())
    // Priced off the live mint read (500 cents), not the catalogue row the page was showing.
    expect(authorizeUsdCredit).toHaveBeenCalledWith(session.identity, 500, undefined, {
      contractAddress: '0xcollection',
      itemId: '7'
    })
  })

  it('should complete the purchase like any other', async () => {
    renderResuming(mintItem)

    expect(await screen.findByText(/purchase complete/i)).toBeInTheDocument()
  })

  it('should report a sold-out mint as no longer available, not as a broken purchase', async () => {
    fetchStoreMintState.mockResolvedValue({ priceWei: TEN_MANA, available: 0 })

    renderResuming(mintItem)

    expect(await screen.findByTestId('buy-error')).toBeInTheDocument()
    expect(buyOneWithCredits).not.toHaveBeenCalled()
  })
})
