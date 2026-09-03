import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'
import { WrongNetworkError } from '~/lib/network'

/**
 * THE RESERVATION DECISIONS in the PDP buy flow — when a credit is minted, and when it is handed back.
 *
 * WHEN: an ephemeral credit is signed and cannot be revoked, so it holds its dollars until it expires
 * whatever the client does next. Reserving on OPEN therefore charged a buyer for looking. Nothing on
 * screen needs it, so it happens on the Buy click.
 *
 * WHEN NOT: this modal releases from several places, and some of them can run AFTER the transaction has
 * gone out. Releasing a credit that is consumed on-chain hands the buyer back money they have already
 * spent: the balance rises, the reconciler debits it again once the squid indexes the consumption, and
 * anything they buy in that gap drives the balance negative.
 *
 * There was no spec for this component at all, which is how the release defect survived — the equivalent
 * bug in the cart shipped twice for exactly that reason. The tests drive the real flow (the Buy CTA, or
 * `resume`, which auto-confirms) and assert on what `authorizeUsdCredit` and `cancelUsdIntents` are called
 * with, never on internals.
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
  ContractName: { CreditsManager: 'CreditsManager', MANAToken: 'MANAToken', OffChainMarketplaceV3: 'OffChainMarketplaceV3', OffChainMarketplaceV2: 'OffChainMarketplaceV2' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: (name: string) => ({ address: `0x${name}`, name, version: '1', abi: [] })
}))

// Plenty of credits and no MANA: the credits rail is the only one on the table, so `resume` confirms it.
// Mutable, defaulting to the plentiful balance every existing test here assumes — only the shortfall
// (`nofunds`) cases lower it.
const balance = { data: { balanceCents: 100_000, credits: 10_000 } }
// The buyer's MANA, controllable: whether a MANA rail exists is exactly what decides the no-funds path.
// `data` is undefined until the query answers — the state the race suite below depends on being modelable.
const manaBalance: { data: bigint | undefined } = { data: 0n }
vi.mock('~/hooks/useBalance', () => ({ useBalance: () => balance }))

// Mutable so both sides of the iOS web-view gate are reachable.
const iap = { on: false }
vi.mock('~/lib/iap', () => ({ isIapMode: () => iap.on }))
vi.mock('~/hooks/useManaBalance', () => ({ useManaBalance: () => manaBalance }))
// Whether the buyer can take the gas-paying fallback is decided by lib/gas-rail (self-custody + funded);
// the modal only has to obey it, so it is mocked here rather than re-derived.
const { canOfferGasRail } = vi.hoisted(() => ({ canOfferGasRail: vi.fn() }))
vi.mock('~/lib/gas-rail', () => ({ canOfferGasRail }))
const { switchChain } = vi.hoisted(() => ({ switchChain: vi.fn() }))
// Only the wallet-moving call is faked; WrongNetworkError and chainLabel stay real so the tests fail the
// same way the app does.
vi.mock('~/lib/network', async importOriginal => {
  const actual = await importOriginal<typeof import('~/lib/network')>()
  return { ...actual, switchChain }
})
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
const { readTradeManaPriceWei, readManaBalanceWei } = vi.hoisted(() => ({
  readTradeManaPriceWei: vi.fn(async () => 0n),
  // Reached only when the hook's balance has not resolved yet — which is the whole point of the suite
  // below, and was the bug: an unresolved balance used to read as "holds no MANA".
  readManaBalanceWei: vi.fn(async () => 0n)
}))
vi.mock('~/lib/mana', () => ({ readTradeManaPriceWei, readManaBalanceWei }))
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

// resume=true confirms as soon as the purchase resolves — the same call the Buy CTA makes.
const renderResuming = (over?: Partial<CatalogItem>) => renderModal({ resume: true, over })
// resume=false prices the purchase and then waits for the buyer, which is what an ordinary open looks like.
const renderIdle = () => renderModal({ resume: false })

// The Buy CTA — the only thing that reserves anything. Both the plain ready state and the payment-method
// step label it "Buy", so this drives the modal from either.
async function clickBuy() {
  fireEvent.click(await screen.findByRole('button', { name: /^buy$/i }))
}

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
  // ECHOES the requested price, rounded up to a whole credit — which is exactly what the credits-server
  // does (`Math.ceil(rawPrice / 10) * 10`). A fixed number here would silently disagree with the price the
  // modal resolved, which is a real condition the component now refuses to charge through.
  authorizeUsdCredit.mockImplementation(async (_identity: unknown, usdPriceCents: number) => ({
    credit: { id: 'credit-1' },
    maxCreditedValue: '1000000000000000000',
    usdCents: Math.ceil(usdPriceCents / 10) * 10
  }))
  buyOneWithCredits.mockResolvedValue('0xhash')
  gaslessOn.value = false
  waitForSettlement.mockResolvedValue(undefined)
})

/**
 * WHEN THE DOLLARS ARE RESERVED — the money question this modal gets asked most.
 *
 * An ephemeral credit is SIGNED, and a signed credit cannot be revoked: it stays spendable until its own
 * expiry whatever the client does afterwards, and the balance keeps subtracting it for that whole time.
 * So a reservation made on open is not "released on close" — closing changes a row, not the credit's
 * clock. Merely looking at an item froze its price out of the balance for minutes, and a buyer who opened
 * two items a few times ran out of money she still had.
 *
 * The whole fix is WHERE the authorize happens, so that is what these pin.
 */
describe('when the modal is opened', () => {
  it('should reserve nothing', async () => {
    renderIdle()

    // The ready state proves the open sequence RAN — asserting on the absence alone would pass on a modal
    // that never got anywhere.
    await screen.findByRole('button', { name: /^buy$/i })
    expect(authorizeUsdCredit).not.toHaveBeenCalled()
  })

  it('should still show the price, which never needed a reservation to know', async () => {
    // 2700¢ off the resolved trade → 270 credits. The authorize does not PRICE the purchase, it echoes
    // what it is sent (rounded up to a whole credit — the same rounding this number already has), so the
    // figure on screen is the figure that gets charged.
    renderIdle()

    expect(await screen.findByText('270')).toBeInTheDocument()
    expect(authorizeUsdCredit).not.toHaveBeenCalled()
  })

  it('should reserve nothing however many times it is opened and closed', async () => {
    for (let i = 0; i < 5; i++) {
      const { unmount } = renderIdle()
      await screen.findByRole('button', { name: /^buy$/i })
      unmount()
    }

    expect(authorizeUsdCredit).not.toHaveBeenCalled()
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })
})

describe('when the buyer confirms', () => {
  it('should reserve exactly once, then buy with what it reserved', async () => {
    renderIdle()
    await clickBuy()

    await waitFor(() => expect(buyOneWithCredits).toHaveBeenCalled())
    expect(authorizeUsdCredit).toHaveBeenCalledTimes(1)
    expect(authorizeUsdCredit).toHaveBeenCalledWith(session.identity, 2700, 'trade-1', {
      contractAddress: '0xcontract',
      itemId: '1'
    })
    expect(buyOneWithCredits.mock.calls[0][0].purchase.credits).toEqual([{ id: 'credit-1' }])
  })
})

/**
 * The authorize is a signed round-trip and now runs on the click, so the buyer can leave while it is in
 * flight — when there is no credit id yet for the unmount cleanup to release.
 */
describe('when the buyer leaves while the reservation is being made', () => {
  it('should release it rather than buy on a modal that is gone', async () => {
    let settle: (v: unknown) => void = () => undefined
    authorizeUsdCredit.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          settle = resolve
        })
    )

    const { unmount } = renderIdle()
    await clickBuy()
    await waitFor(() => expect(authorizeUsdCredit).toHaveBeenCalled())
    unmount()
    settle({ credit: { id: 'credit-1' }, maxCreditedValue: '1000000000000000000', usdCents: 2700 })

    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
    expect(buyOneWithCredits).not.toHaveBeenCalled()
  })
})

/**
 * The price the buyer agreed to is the price they get charged — enforced, not assumed.
 *
 * The credits-server hands back an EXISTING live credit for the same item rather than minting a second
 * one, and that one was priced at an earlier oracle read. So the amount that comes back CAN differ from
 * the amount on screen. Charging it anyway would be taking money for a number the buyer never saw.
 */
describe('when the reservation comes back at a different price', () => {
  const AT_3300 = {
    credit: { id: 'credit-1' },
    maxCreditedValue: '1000000000000000000',
    usdCents: 3300
  }

  it('should not buy anything', async () => {
    authorizeUsdCredit.mockResolvedValueOnce(AT_3300)

    renderIdle()
    await clickBuy()

    await waitFor(() => expect(authorizeUsdCredit).toHaveBeenCalled())
    expect(buyOneWithCredits).not.toHaveBeenCalled()
  })

  it('should show the buyer the price they would actually pay, and say it changed', async () => {
    authorizeUsdCredit.mockResolvedValueOnce(AT_3300)

    renderIdle()
    await clickBuy()

    expect(await screen.findByTestId('price-changed')).toBeInTheDocument()
    expect(screen.getByText('330')).toBeInTheDocument()
  })

  it('should spend the credit it already holds when the buyer agrees, not a second one', async () => {
    authorizeUsdCredit.mockResolvedValueOnce(AT_3300)

    renderIdle()
    await clickBuy()
    await screen.findByTestId('price-changed')
    await clickBuy()

    await waitFor(() => expect(buyOneWithCredits).toHaveBeenCalled())
    expect(authorizeUsdCredit).toHaveBeenCalledTimes(1)
  })
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
    // A credit exists and nothing was ever sent with it. Reaching that state now takes the one path that
    // holds a reservation without submitting: the authorize came back at a price the buyer had not agreed
    // to, so the modal went back and asked. They closed instead — and those dollars must come back.
    //
    // Merely opening the modal can no longer reach here, because opening no longer reserves anything.
    authorizeUsdCredit.mockResolvedValueOnce({
      credit: { id: 'credit-1' },
      maxCreditedValue: '1000000000000000000',
      usdCents: 3300
    })

    const { unmount } = renderIdle()
    await clickBuy()
    await waitFor(() => expect(authorizeUsdCredit).toHaveBeenCalledTimes(1))
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

  // The shortfall is decided against the resolved price, which the open sequence already has. Reserving
  // to find out would freeze dollars this buyer demonstrably cannot spend.
  it('should reach the pack picker without reserving anything', async () => {
    renderIdle()

    await screen.findByTestId('credit-packs')
    expect(authorizeUsdCredit).not.toHaveBeenCalled()
  })

  /**
   * ONLY PACKS THAT FINISH THE PURCHASE.
   *
   * This picker lives inside "Buy Credits and Item", so every pack in it is a promise that buying it
   * completes the purchase. Reported from zone on this exact item: 270 credits against a balance of 73 is a
   * 197 shortfall, and the picker offered 40 and 100 — either one leaves the buyer short, back on this same
   * screen, having paid.
   */
  describe('and some packs cannot cover the shortfall', () => {
    beforeEach(() => {
      // The real balance from the report: 270 - 73 = 197 short. Three packs, not the real four, because
      // MAX_OFFER_PACKS is mocked to 3 at the top of this file — a fourth would be sliced off before the
      // filter ever sees it, and the test would be asserting the slice rather than the filter.
      balance.data = { balanceCents: 730, credits: 73 }
      creditPacks.packs = [
        { id: 'pack_40', credits: 40, usd: 5.99 },
        { id: 'pack_100', credits: 100, usd: 11.99 },
        { id: 'pack_260', credits: 260, usd: 29.99 }
      ]
    })

    it('should offer only the packs that clear the shortfall', async () => {
      renderIdle()

      const packs = await screen.findByTestId('credit-packs')
      // 73 + 260 reaches 270; 73 + 40 and 73 + 100 do not. Exact-text queries, because
      // `toHaveTextContent` matches substrings and '260' would satisfy an assertion about '60'.
      expect(within(packs).getByText('260')).toBeInTheDocument()
      expect(within(packs).queryByText('40')).not.toBeInTheDocument()
      expect(within(packs).queryByText('100')).not.toBeInTheDocument()
    })

    it('should keep offering every pack when none of them is enough', async () => {
      // An item dearer than the largest pack: an empty picker would be worse than an honest one.
      balance.data = { balanceCents: 0, credits: 0 }
      creditPacks.packs = [{ id: 'pack_40', credits: 40, usd: 5.99 }]
      renderIdle()

      expect(within(await screen.findByTestId('credit-packs')).getByText('40')).toBeInTheDocument()
    })
  })

  /**
   * The disabled MANA button is gone from this screen.
   *
   * It rendered "Buy with MANA <n>" in grey with "Not enough MANA" under it, where <n> was the buyer's
   * BALANCE — `ManaShortfall.manaWei` is documented as the balance despite the type's name. So a 270-credit
   * item showed "Buy with MANA 20" and read as an offer to buy it for 20 MANA. The way forward on this
   * screen is the pack picker; a dead button above it competes with the thing that works.
   */
  describe('and the MANA they hold cannot cover it either', () => {
    beforeEach(() => {
      manaBalance.data = 20n * 10n ** 18n
      readTradeManaPriceWei.mockResolvedValue(1000n * 10n ** 18n) // dearer than the balance → no MANA rail
    })

    // Restored here rather than left to the parent, which only resets the credit balance and the packs.
    afterEach(() => {
      manaBalance.data = 0n
      readTradeManaPriceWei.mockResolvedValue(0n)
    })

    it('should not offer a disabled MANA button beside the pack picker', async () => {
      renderIdle()

      await screen.findByTestId('credit-packs')
      expect(screen.queryByTestId('pay-with-mana-disabled')).not.toBeInTheDocument()
      expect(screen.queryByTestId('mana-shortfall-note')).not.toBeInTheDocument()
    })
  })

  /**
   * The other half of the same answer: when our own balance read is stale or missing, the server is the
   * one that says no — and it says so on the click, not on the open.
   */
  describe('and only the server knows the balance is short', () => {
    beforeEach(() => {
      balance.data = PLENTY.data
      authorizeUsdCredit.mockRejectedValue(new Error('authorizeUsdCredit 402: Insufficient credits'))
    })

    it('should show the pack picker rather than a bare error', async () => {
      renderIdle()
      await clickBuy()

      expect(await screen.findByTestId('credit-packs')).toBeInTheDocument()
      expect(buyOneWithCredits).not.toHaveBeenCalled()
    })
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
    expect(purchase.credits).toEqual([expect.objectContaining({ id: 'credit-1' })])
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

/**
 * A buyer holding MANA and no credits used to be shown "Insufficient funds — buy credits" FIRST, because
 * the MANA price was read by a later effect gated on the phase already being `nofunds`. The dead end was
 * painted by construction and only became an offer once the oracle answered — long after they had read
 * that they could not afford it.
 */
describe('when credits fall short but the buyer holds MANA', () => {
  const ONE_MANA = 10n ** 18n

  beforeEach(() => {
    balance.data = { balanceCents: 0, credits: 0 }
    manaBalance.data = 100n * ONE_MANA
    readTradeManaPriceWei.mockResolvedValue(ONE_MANA)
    // Real packs, or `goNoFunds` throws reading `cover.id` off an empty catalogue and the modal lands in
    // `error` — never reaching the pack picker these cases are about (see the fixture's own comment).
    creditPacks.packs = [{ id: 'pack_5', credits: 40, usd: 5.99 }]
  })

  afterEach(() => {
    balance.data = { balanceCents: 100_000, credits: 10_000 }
    manaBalance.data = 0n
    readTradeManaPriceWei.mockResolvedValue(0n)
    creditPacks.packs = []
  })

  /**
   * Holding MANA routes the buyer to the payment-method chooser INSTEAD of the no-funds screen, so the
   * held-credits explanation has to live there too. Otherwise the person most likely to be confused —
   * their balance is short only BECAUSE their own credits are held — is the one who never sees why, and
   * is quietly asked to pay a second time for money they already committed.
   */
  it('should explain held credits on the payment-method chooser, not only on the no-funds screen', async () => {
    balance.data = {
      balanceCents: 0,
      credits: 0,
      held: { cents: 30, credits: 3, releasesAtSeconds: null, purchases: [] }
    } as typeof balance.data

    renderModal({ resume: false })

    await waitFor(() => expect(screen.getByText(/on hold from a purchase you already started/i)).toBeInTheDocument())
  })

  /**
   * The metric that was inflated: it fired for everyone short on credits, including everyone who could
   * simply pay in MANA — so "users with no funds" counted people who had the money.
   */
  it('should not report a credits prompt to someone who can pay', async () => {
    renderIdle()

    // The oracle read proves the no-funds path actually ran — without it the assertion below would pass
    // on a modal that never got there.
    await waitFor(() => expect(readTradeManaPriceWei).toHaveBeenCalled())
    expect(track).not.toHaveBeenCalledWith('Shop Buy Credits Prompted', expect.anything())
  })

  // The guard that moving this read onto the blocking path would have dropped: someone with no MANA has
  // nothing to gain from the oracle and must not be made to wait for it.
  it('should not ask the oracle at all when the buyer holds no MANA', async () => {
    manaBalance.data = 0n
    renderIdle()

    expect(await screen.findByText(/insufficient funds/i)).toBeInTheDocument()
    expect(readTradeManaPriceWei).not.toHaveBeenCalled()
  })

  /**
   * AN UNRESOLVED BALANCE IS NOT A ZERO BALANCE.
   *
   * `useManaBalance` is a react-query hook, so its `data` is `undefined` until it answers. The decision
   * collapsed that into "holds no MANA" with `?? 0n`, so a buyer who opened this modal before the read
   * landed was sent to the pack picker — and then watched the screen turn into a payment choice once the
   * balance arrived. The effect that fills the MANA price kept the two apart (`== null || <= 0n`); the
   * decision did not.
   *
   * Reported on zone, on a 41-credit item: "apenas toco buy now" showed the pack picker, then it changed
   * by itself. The balance is now awaited through the same query key, so the first screen is the right one.
   */
  describe('and the MANA balance has not resolved yet', () => {
    beforeEach(() => {
      manaBalance.data = undefined
      readManaBalanceWei.mockResolvedValue(100n * ONE_MANA)
      readTradeManaPriceWei.mockResolvedValue(ONE_MANA)
    })

    it('should open straight on the payment choice, never flashing the pack picker', async () => {
      renderIdle()

      expect(await screen.findByTestId('confirm-payment')).toBeInTheDocument()
      expect(screen.getByTestId('pay-with-mana')).toBeInTheDocument()
      expect(screen.queryByTestId('credit-packs')).not.toBeInTheDocument()
    })

    it('should read the balance it was not handed, rather than assuming zero', async () => {
      renderIdle()

      await screen.findByTestId('confirm-payment')
      // Assuming zero is what skipped the oracle and produced the wrong screen.
      expect(readManaBalanceWei).toHaveBeenCalled()
      expect(readTradeManaPriceWei).toHaveBeenCalled()
    })

    it('should not report a credits prompt for a buyer it had not finished measuring', async () => {
      renderIdle()

      await screen.findByTestId('confirm-payment')
      // The same funnel inflation the resolved-balance case above guards, reintroduced by the race.
      expect(track).not.toHaveBeenCalledWith('Shop Buy Credits Prompted', expect.anything())
    })

    it('should still reach the pack picker when the read says the buyer holds nothing', async () => {
      readManaBalanceWei.mockResolvedValue(0n)
      renderIdle()

      expect(await screen.findByTestId('credit-packs')).toBeInTheDocument()
    })

    it('should fall back to the pack picker when the balance cannot be read', async () => {
      readManaBalanceWei.mockRejectedValue(new Error('rpc down'))
      renderIdle()

      // An unreadable balance answers 0n: no MANA rail, which is what the buyer saw before any of this.
      expect(await screen.findByTestId('credit-packs')).toBeInTheDocument()
    })
  })

  /**
   * The oracle failing is not the same as the buyer being unable to pay, and it used to be
   * indistinguishable: the catch only warned in DEV, so in production the MANA option disappeared with
   * nobody the wiser — no log, no metric, no notice.
   *
   * Pins the REPORTING half. The buyer-facing notice this also adds is not covered here; see the PR.
   */
  it('should report a failed MANA price read instead of swallowing it', async () => {
    readTradeManaPriceWei.mockRejectedValue(new Error('oracle down'))
    renderIdle()

    await waitFor(() =>
      expect(captureError).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ step: 'mana_price' }))
    )
  })

  it('should tell the buyer the price could not be checked, rather than dropping the rail in silence', async () => {
    readTradeManaPriceWei.mockRejectedValue(new Error('oracle down'))
    renderIdle()

    expect(await screen.findByTestId('mana-price-unavailable')).toBeInTheDocument()
  })

  // Not owed to someone with no MANA: nothing was asked of the oracle on their behalf.
  it('should not claim the price is unavailable when it never asked', async () => {
    manaBalance.data = 0n
    readTradeManaPriceWei.mockRejectedValue(new Error('oracle down'))
    renderIdle()

    await waitFor(() => expect(track).toHaveBeenCalledWith('Shop Buy Credits Prompted', expect.anything()))
    expect(screen.queryByTestId('mana-price-unavailable')).toBeNull()
  })
})

/**
 * The warning is about a price we could not read. Once one HAS been read the sentence is simply false —
 * and the MANA buttons are on screen beside it, so it contradicts what the buyer can see.
 */
describe('when the MANA price arrives after a failed read', () => {
  const ONE_MANA = 10n ** 18n

  beforeEach(() => {
    balance.data = { balanceCents: 0, credits: 0 }
    manaBalance.data = 100n * ONE_MANA
    creditPacks.packs = [{ id: 'pack_5', credits: 40, usd: 5.99 }]
    // Fails for goNoFunds, succeeds for the retry that follows it.
    readTradeManaPriceWei.mockRejectedValueOnce(new Error('blip')).mockResolvedValue(ONE_MANA)
  })

  afterEach(() => {
    balance.data = { balanceCents: 100_000, credits: 10_000 }
    manaBalance.data = 0n
    creditPacks.packs = []
    readTradeManaPriceWei.mockReset().mockResolvedValue(0n)
  })

  // One outage is one report. The retry re-reads; it does not re-raise.
  it('should not report the same outage twice', async () => {
    readTradeManaPriceWei.mockReset().mockRejectedValue(new Error('down'))
    renderIdle()

    await waitFor(() => expect(readTradeManaPriceWei).toHaveBeenCalledTimes(2))
    const reports = captureError.mock.calls.filter(c => (c[1] as { step?: string })?.step === 'mana_price')
    expect(reports).toHaveLength(1)
  })
})

/**
 * The price lock is taken when the modal OPENS, not when the buyer confirms — so by the time they dismiss
 * the wallet prompt, credits have already been held and their balance has visibly dropped. The catch then
 * clears `reservedCreditIdRef` (so the unmount path cannot release twice), and clearing it also put the
 * "they come back" sentence out of reach: a cancelled signature showed a balance tens of credits lower than
 * a moment earlier with nothing on screen to account for it.
 */
describe('when a failure leaves a hold on its way back', () => {
  const errorText = async () => (await screen.findByTestId('buy-error')).textContent ?? ''

  it('should say the credits are coming back, ON TOP of why it failed', async () => {
    buyOneWithCredits.mockRejectedValue(new Error('user rejected transaction'))

    renderResuming()

    // Both halves: the reason explains the screen, the hold explains the balance.
    await waitFor(async () => expect(await errorText()).toContain('cancelled'))
    expect(await errorText()).toContain('return to your balance')
  })

  it('should say nothing about a hold when none was taken', async () => {
    // Nothing was ever reserved, so promising a return would be describing money we never held.
    authorizeUsdCredit.mockRejectedValue(new Error('boom'))

    renderResuming()

    await screen.findByTestId('buy-error')
    expect(await errorText()).not.toContain('return to your balance')
  })

  it('should NOT claim a return for a credit that may already be spent', async () => {
    // Broadcast with no readable receipt: the guard keeps the credit, nothing is released, and telling the
    // buyer it is coming back would be a lie told at the worst possible moment.
    buyOneWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast' })
      throw new Error('receipt unavailable')
    })

    renderResuming()

    await screen.findByTestId('buy-error')
    expect(cancelUsdIntents).not.toHaveBeenCalled()
    expect(await errorText()).not.toContain('return to your balance')
  })
})

/**
 * The gas-paying fallback is only reachable because a relayed rail already failed, so who is offered it is
 * the whole question: a managed wallet cannot switch or hold POL, and network wording is what those users
 * must never be shown at all.
 */
describe('when a wrong network stops the buy', () => {
  const wrongNetwork = () => new WrongNetworkError(1, 80002)

  beforeEach(() => {
    canOfferGasRail.mockResolvedValue(true)
    switchChain.mockResolvedValue(undefined)
    buyOneWithCredits.mockRejectedValue(wrongNetwork())
  })

  it('should offer the switch to a buyer who can take it', async () => {
    renderResuming()

    expect(await screen.findByTestId('switch-and-retry')).toBeInTheDocument()
  })

  it('should NOT offer it to a managed wallet, and should hand the hold back instead', async () => {
    canOfferGasRail.mockResolvedValue(false)

    renderResuming()

    await screen.findByTestId('buy-error')
    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
    expect(screen.queryByTestId('switch-and-retry')).toBeNull()
  })
})

/**
 * Cancelling the signature has to say, on the SAME paint as the failure, that the money is coming back.
 *
 * It used to wait for the release round-trip: the ref was cleared synchronously and `holdReleased` only
 * arrived when `cancelUsdIntents` resolved, so the error screen rendered with nothing but "we couldn't
 * complete your purchase" — the reassurance landed a beat later, after the buyer had already read the bad
 * news and, per the report, never seemed to arrive at all.
 */
describe('when the buyer cancels the signature', () => {
  beforeEach(() => {
    buyOneWithCredits.mockRejectedValue(Object.assign(new Error('User rejected the request'), { code: 4001 }))
  })

  it('should promise the credits back on the same paint as the failure', async () => {
    // Never resolves: the release is still in flight when the error screen renders, which is exactly the
    // window the buyer was seeing.
    cancelUsdIntents.mockReturnValue(new Promise(() => {}))

    renderResuming()

    expect(await screen.findByText(/your credits are safe/i)).toBeInTheDocument()
    expect(screen.getByText(/return to your balance/i)).toBeInTheDocument()
  })

  /**
   * NOT covered here, and deliberately: the one case that must not promise anything is the guard
   * withholding a credit that may already be spent. `releaseReservation` reports `true` whether the cancel
   * request succeeds OR fails — on purpose, since an unconsumed credit returns on the server's sweep
   * either way — so the only source of `false` is `guardRef.mayBeConsumed`, which needs a broadcast this
   * harness cannot stage. The withdrawal path is pinned by lib/spend-guard's own specs.
   */
})

/**
 * The cart's success page linked the launcher while this modal's identical-looking CTA only closed
 * itself, so the same "Try in World" did different things depending on which door the purchase came
 * through. This pins that it navigates.
 */
describe('when the purchase completes', () => {
  const completePurchase = () => {
    buyOneWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast' })
      return '0xhash'
    })
    renderResuming()
  }

  it('should point Try in World at the launcher deep-link', async () => {
    completePurchase()
    expect(await screen.findByText(/purchase complete/i)).toBeInTheDocument()

    const cta = await screen.findByRole('link', { name: /try in world/i })
    expect(cta.getAttribute('href')).toMatch(/decentraland\.(zone|org)\/jump/)
  })

  it('should open it outside the shop, so the purchase flow is not replaced', async () => {
    completePurchase()
    expect(await screen.findByText(/purchase complete/i)).toBeInTheDocument()

    const cta = await screen.findByRole('link', { name: /try in world/i })
    expect(cta.getAttribute('target')).toBe('_blank')
    expect(cta.getAttribute('rel')).toContain('noreferrer')
  })

  /**
   * Inside the web view the launcher is a dead end — that page cannot run in there, so a buyer who had just
   * paid was handed a link that did nothing. The cart's success page already hands off to the app instead,
   * and both post-purchase surfaces have to offer the same thing for the same purchase.
   */
  describe('and the shop is running inside the ios web view', () => {
    beforeEach(() => {
      iap.on = true
    })

    afterEach(() => {
      iap.on = false
    })

    it('should hand the purchase to the app instead of the launcher', async () => {
      completePurchase()
      expect(await screen.findByText(/purchase complete/i)).toBeInTheDocument()

      const cta = await screen.findByRole('link', { name: /backpack/i })
      expect(cta.getAttribute('href')).toMatch(/^decentraland:\/\/open\?iap_enabled=true/)
      expect(screen.queryByRole('link', { name: /try in world/i })).not.toBeInTheDocument()
    })

    // A custom scheme opened in a new tab leaves an orphaned blank one behind once the app takes over.
    it('should open the deep link in place, not in a new tab', async () => {
      completePurchase()
      expect(await screen.findByText(/purchase complete/i)).toBeInTheDocument()

      const cta = await screen.findByRole('link', { name: /backpack/i })
      expect(cta.getAttribute('target')).toBeNull()
    })
  })
})
