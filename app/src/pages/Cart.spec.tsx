import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'
import { useCart } from '~/store/cart'

/**
 * THE WIRING OF A FAILED CART CHECKOUT — the money decisions, asserted through the page.
 *
 * These specs exist because the same class of bug shipped twice from this file, and both times every test in
 * the suite passed. `partitionReservations` and `buyManyWithCredits` are covered one layer below, and a unit
 * test there cannot see whether the page CALLS them with the right things, nor whether the copy it sets ever
 * reaches the screen. Concretely, all three of these were green while broken:
 *
 *  - the salt -> line pairing was declared and never populated, so the cart cleanup was a no-op;
 *  - the gasless rail (the DEFAULT for a trade-only basket) never reported its broadcasts, so the catch
 *    released credits already consumed on-chain;
 *  - the partial-purchase message was handed to a modal that never rendered it.
 *
 * So the assertions here are deliberately about observable outcomes — what `cancelUsdIntents` is called with,
 * which rows survive in the store, and what the buyer reads — not about internal calls.
 */

const session = {
  address: '0xbuyer000000000000000000000000000000000001',
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: { authChain: [] } as never,
  providerType: 'injected' as never
}
vi.mock('~/store/wallet', () => ({ useWallet: () => ({ session, signIn: vi.fn() }) }))

// decentraland-transactions ships an ESM directory import that vitest's node resolver cannot follow, so it is
// mocked wholesale (the same workaround MarketCheckout.spec.tsx documents). Nothing here reaches a contract.
vi.mock('decentraland-transactions', () => ({
  ContractName: { CreditsManager: 'CreditsManager', CollectionStore: 'CollectionStore' },
  getContractName: () => 'DecentralandMarketplacePolygon',
  getContract: (name: string) => ({ address: `0x${name}`, name, version: '1', abi: ['function accept(uint256[] x)'] }),
  sendMetaTransaction: vi.fn(),
  MetaTransactionError: class MetaTransactionError extends Error {},
  ErrorCode: { USER_DENIED: 'USER_DENIED' }
}))

// Plenty of credits: this file is about what happens AFTER the charge starts, so the balance must never be
// what steers the flow (a short balance would open the pack picker instead). Mutable only because one case at
// the bottom needs the OPPOSITE — a balance that funds no rail, which is what makes the summary panel fall
// back to its plain checkout CTA.
const { balance } = vi.hoisted(() => ({ balance: { cents: 100_000 } }))
vi.mock('~/hooks/useBalance', () => ({
  useBalance: () => ({ data: { balanceCents: balance.cents, credits: Math.floor(balance.cents / 10) }, isError: false })
}))
// No MANA by default, so `computePaymentOptions` (real) offers the credits rail only and one click charges.
// Mutable because the shortfall case needs the opposite: MANA that is held but cannot pay, which is what
// used to swallow the checkout button.
const { mana } = vi.hoisted(() => ({ mana: { wei: 0n } }))
vi.mock('~/hooks/useManaBalance', () => ({ useManaBalance: () => ({ data: mana.wei }) }))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: { rate: 50_000_000n, decimals: 8 } }) }))
// Every line buyable: availability is a different concern with its own specs.
vi.mock('~/hooks/useCartAvailability', () => ({ useCartAvailability: () => ({}) }))
// The per-line "Creator" chip is gated on this; `secondarySales` lets a test pick the state it needs.
const secondarySales = { on: false }
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => secondarySales.on }))

const { authorizeUsdCredit, cancelUsdIntents } = vi.hoisted(() => ({
  authorizeUsdCredit: vi.fn(),
  cancelUsdIntents: vi.fn().mockResolvedValue(0)
}))
vi.mock('~/lib/credits', () => ({
  authorizeUsdCredit,
  cancelUsdIntents,
  getUsdBalance: vi.fn(),
  devMintUsd: vi.fn()
}))

/**
 * The seam under test. `buyManyWithCredits` is replaced by a driver that reports whatever outcome a test
 * wants through the real callbacks and then throws — which is exactly what the real one does when a buyer
 * rejects the second wallet prompt, or when a group reverts.
 */
const { buyManyWithCredits } = vi.hoisted(() => ({ buyManyWithCredits: vi.fn() }))
vi.mock('~/lib/buy', async orig => ({ ...(await orig<Record<string, unknown>>()), buyManyWithCredits }))

// Gasless off: the direct rail is where the per-group outcomes are reported. The gasless rail has its own
// case at the bottom of this file.
const { gaslessEnabled } = vi.hoisted(() => ({ gaslessEnabled: vi.fn(() => false) }))
vi.mock('~/lib/gasless-config', () => ({ gaslessEnabled }))
const { buyManyGasless, waitForSettlement } = vi.hoisted(() => ({
  buyManyGasless: vi.fn(),
  waitForSettlement: vi.fn()
}))
vi.mock('~/lib/buy-gasless', () => ({
  buyManyGasless,
  waitForSettlement,
  relay: vi.fn(),
  GaslessUnavailableError: class GaslessUnavailableError extends Error {},
  SettlementPendingError: class SettlementPendingError extends Error {}
}))

// reviewCart is mocked so the basket resolves deterministically offline; partitionReservations stays REAL —
// it is half of what is being tested.
const { reviewCart } = vi.hoisted(() => ({ reviewCart: vi.fn() }))
vi.mock('~/lib/cart-checkout', async orig => ({ ...(await orig<Record<string, unknown>>()), reviewCart }))

vi.mock('~/lib/api', async orig => ({
  ...(await orig<Record<string, unknown>>()),
  resolveLiveTrade: vi.fn(),
  fetchListings: vi.fn().mockResolvedValue({ data: [] }),
  fetchStoreMintState: vi.fn()
}))
vi.mock('~/lib/mana-rate', () => ({
  readManaUsdRate: vi.fn(async () => ({ rate: 50_000_000n, decimals: 8 })),
  usdCentsToManaWei: () => 0n,
  manaWeiToUsdCents: () => 0,
  manaWeiToCredits: () => 0,
  manaWeiToUsdWei: () => 0n
}))
vi.mock('~/lib/buy-mana', () => ({ buyManyWithMana: vi.fn() }))
vi.mock('~/lib/authorizations', () => ({
  AuthorizationKind: { ManaSpending: 'mana' },
  ensureAuthorization: vi.fn(),
  getAuthorizationStatus: vi.fn(),
  getManaSpendingAuthorization: vi.fn(),
  needsApprovalStep: () => false
}))
vi.mock('~/lib/after-purchase', () => ({ invalidateAfterPurchase: vi.fn() }))

const { track, captureError } = vi.hoisted(() => ({ track: vi.fn(), captureError: vi.fn() }))
vi.mock('~/lib/analytics', async orig => ({ ...(await orig<Record<string, unknown>>()), track }))
vi.mock('~/lib/monitoring', () => ({ captureError }))

// The page maps errors with its OWN local friendlyError, so these are the real strings it renders. Asserting
// on the copy (rather than on a mocked sentinel) is what proves the message reaches the DOM at all — the modal
// used to discard it.
const GENERIC = /couldn't complete checkout/i
const PARTIAL = /part of your purchase went through/i

const navigate = vi.fn()
vi.mock('react-router-dom', async orig => ({
  ...(await orig<Record<string, unknown>>()),
  useNavigate: () => navigate
}))

const { Cart } = await import('~/pages/Cart')

const item = (id: string, over: Partial<CatalogItem> = {}): CatalogItem => ({
  id,
  name: `Item ${id}`,
  creator: '0xcreator',
  contractAddress: '0xcontract',
  itemId: id,
  category: 'wearable',
  rarity: 'common',
  network: 'MATIC',
  chainId: 80002,
  thumbnail: '',
  priceCredits: 20,
  gender: null,
  isSmart: false,
  tradeId: `trade-${id}`,
  ...over
})

// A resolved line as reviewCart returns it: a native trade, priced live.
const line = (i: CatalogItem) => ({
  item: { ...i, quantity: 1 },
  acquisition: 'trade' as const,
  trade: { id: i.tradeId, chainId: 80002, contract: '0xmarket', signer: '0xseller' },
  priceCredits: 20,
  usdCents: 200,
  quantity: 1
})

// A resolved MINT line: no trade, minted from the CollectionStore, priced in MANA.
const storeLine = (i: CatalogItem) => ({
  item: { ...i, quantity: 1, tradeId: undefined },
  acquisition: 'store' as const,
  manaWei: '1000000000000000000',
  priceCredits: 20,
  usdCents: 200,
  quantity: 1
})

function renderCart(items: CatalogItem[], toLine: (i: CatalogItem) => unknown = line) {
  useCart.setState({ items: items.map(i => ({ ...i, quantity: 1 })), open: false })
  const review = {
    buyable: items.map(toLine),
    unavailable: [],
    own: [],
    liveTotalCredits: 20 * items.length,
    orderChanged: false
  }
  reviewCart.mockResolvedValue(review)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Cart />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// One credit per authorize, salt = `salt-<n>`, in the order the lines are authorized.
function stubAuthorize() {
  let n = 0
  authorizeUsdCredit.mockImplementation(async () => {
    n += 1
    return {
      credit: { id: `salt-${n}`, value: '200', expiresAt: 0, salt: `salt-${n}`, signature: '0x' },
      maxCreditedValue: '200'
    }
  })
}

// Targets the credits rail by its test id, not by its label: the label is copy that legitimately changes
// with context (it reads "Checkout" when credits is the only rail and "Pay with credits" when there is
// another to tell it apart from), and none of these tests are about the wording.
async function pay() {
  const user = userEvent.setup()
  const cta = await screen.findByTestId('pay-with-credits')
  await user.click(cta)
}

beforeEach(() => {
  vi.clearAllMocks()
  gaslessEnabled.mockReturnValue(false)
  cancelUsdIntents.mockResolvedValue(0)
  useCart.setState({ items: [], open: false })
  balance.cents = 100_000
  mana.wei = 0n
  stubAuthorize()
})

/**
 * The cart page IS the checkout, so its primary CTA has to say so. It used to borrow `assetCard.buyNow` — the
 * label the browse cards and the PDP use, where a click really does buy immediately — which promised a purchase
 * one button before the one that makes it. Its own key now, and this pins that the shared one is gone from here
 * (renaming `assetCard.buyNow` for the cards must not silently re-label this).
 */
describe('the Purchase Summary CTA', () => {
  it('should read "Checkout", never "Buy now"', async () => {
    // No rail is fundable at a zero balance (and there is no MANA), so the panel renders its plain CTA.
    balance.cents = 0
    renderCart([item('a')])

    expect(await screen.findByRole('button', { name: /^checkout$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument()
  })
})

describe('when the buyer confirms the first wallet prompt and rejects the second', () => {
  /**
   * The money assertion. Group 1 is BROADCAST, so its credits are spent whatever happens next; releasing
   * them raises the balance by money already gone, the reconciler re-debits it once the squid indexes the
   * consumption, and anything bought in that gap drives the balance negative.
   */
  it('should release only the reservation that never went out', async () => {
    buyManyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast1', salts: ['salt-1'] })
      opts.onSettled?.({ txHash: '0xsettled1', salts: ['salt-1'] })
      throw new Error('user rejected transaction')
    })

    renderCart([item('a'), item('b')])
    await pay()

    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalled())
    // salt-2 only. Passing salt-1 here is the defect this whole change exists for.
    expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['salt-2'])
  })

  it('should take the paid line out of the cart and keep the unpaid one', async () => {
    buyManyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast1', salts: ['salt-1'] })
      opts.onSettled?.({ txHash: '0xsettled1', salts: ['salt-1'] })
      throw new Error('user rejected transaction')
    })

    renderCart([item('a'), item('b')])
    await pay()

    // THE ASSERTION THAT WAS MISSING. With the salt -> line pairing unpopulated this stayed ['a','b'] — the
    // buyer kept a line they had already paid for, and a retry would have bought it twice.
    await waitFor(() => expect(useCart.getState().items.map(i => i.id)).toEqual(['b']))
  })

  it('should tell the buyer that part of the purchase went through', async () => {
    buyManyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast1', salts: ['salt-1'] })
      opts.onSettled?.({ txHash: '0xsettled1', salts: ['salt-1'] })
      throw new Error('user rejected transaction')
    })

    renderCart([item('a'), item('b')])
    await pay()

    // Rendered, not merely passed as a prop: the modal declared `message` and never read it, so this copy
    // could not reach the screen and the buyer was told "your credits are safe" over a real charge.
    expect(await screen.findByText(PARTIAL)).toBeInTheDocument()
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument()
  })

  it('should book the failure at the value that did NOT go through, and report the rest as revenue', async () => {
    buyManyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast1', salts: ['salt-1'] })
      opts.onSettled?.({ txHash: '0xsettled1', salts: ['salt-1'] })
      throw new Error('user rejected transaction')
    })

    renderCart([item('a'), item('b')])
    await pay()

    await waitFor(() => expect(track.mock.calls.some(c => c[0] === 'Shop Completed Purchase')).toBe(true))
    // $2 of the $4 basket was paid for. Booking the whole basket as failed (and emitting no completed event)
    // understates GMV and overstates checkout failure on exactly this flow.
    const failed = track.mock.calls.find(c => c[0] === 'Shop Purchase Cancelled' || c[0] === 'Shop Purchase Failed')
    expect(failed?.[1]).toMatchObject({ value_usd: 2, partial: true })
    expect(track.mock.calls.find(c => c[0] === 'Shop Completed Purchase')?.[1]).toMatchObject({ partial: true })
  })
})

/**
 * A BROADCAST THAT REVERTED is not a purchase.
 *
 * A revert rolls the whole call back, so no credit was consumed and the buyer owns nothing. Treating broadcast
 * as ownership (the first version of this fix did) empties the cart of a buyer who paid for nothing AND strands
 * their credits until the TTL — the worst of both errors at once.
 */
describe('when the transaction is broadcast and then reverts', () => {
  beforeEach(() => {
    buyManyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast1', salts: ['salt-1'] })
      opts.onReverted?.({ salts: ['salt-1'] })
      const err = new Error('transaction failed') as Error & { receipt: { status: number } }
      err.receipt = { status: 0 }
      throw err
    })
  })

  it('should release the reverted reservation instead of stranding it until the TTL', async () => {
    renderCart([item('a')])
    await pay()

    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['salt-1']))
  })

  it('should leave the line in the cart, because nothing was bought', async () => {
    renderCart([item('a')])
    await pay()

    await waitFor(() => expect(screen.getByText(GENERIC)).toBeInTheDocument())
    expect(useCart.getState().items.map(i => i.id)).toEqual(['a'])
  })

  it('should not claim a partial purchase', async () => {
    renderCart([item('a')])
    await pay()

    await waitFor(() => expect(screen.getByText(GENERIC)).toBeInTheDocument())
    expect(screen.queryByText(PARTIAL)).not.toBeInTheDocument()
    expect(track.mock.calls.some(c => c[0] === 'Shop Completed Purchase')).toBe(false)
  })
})

/**
 * IN FLIGHT, OUTCOME UNKNOWN — a timeout or a dropped socket after the submit.
 *
 * Those credits may still be consumed, so this is the case where the two decisions diverge: do NOT release
 * (the pessimistic side, because releasing a consumed credit corrupts the balance) and do NOT claim ownership
 * (because nothing is confirmed). Stranding a reservation for the TTL is the acceptable half of that trade.
 */
describe('when a broadcast transaction never confirms', () => {
  it('should release nothing and claim nothing', async () => {
    buyManyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast1', salts: ['salt-1'] })
      throw new Error('timeout waiting for receipt')
    })

    renderCart([item('a')])
    await pay()

    await waitFor(() => expect(screen.getByText(GENERIC)).toBeInTheDocument())
    expect(cancelUsdIntents).not.toHaveBeenCalled()
    expect(useCart.getState().items.map(i => i.id)).toEqual(['a'])
  })
})

/**
 * THE GASLESS RAIL — the default for a trade-only basket, and the one that still had the original bug.
 *
 * Relayed transactions are broadcast too. Without the per-group signal the catch released credits that were
 * already consumed on-chain, on the busiest path in the flow.
 */
describe('when the gasless rail relays one group and another hard-reverts', () => {
  it('should release only the reverted group and keep the settled purchase', async () => {
    gaslessEnabled.mockReturnValue(true)
    buyManyGasless.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xrelayed1', salts: ['salt-1'] })
      opts.onBroadcast?.({ txHash: '0xrelayed2', salts: ['salt-2'] })
      return ['0xrelayed1', '0xrelayed2']
    })
    // First group confirms; second mined with status 0, which waitForSettlement reports as a plain Error
    // (credits NOT consumed) rather than SettlementPendingError.
    waitForSettlement.mockImplementation(async (hash: string) => {
      if (hash === '0xrelayed2') throw new Error('transaction reverted')
    })

    renderCart([item('a'), item('b')])
    await pay()

    // salt-1 was consumed on-chain and must survive; salt-2 reverted and must be handed back.
    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['salt-2']))
    expect(useCart.getState().items.map(i => i.id)).toEqual(['b'])
  })

  it('should release nothing while a group may still land', async () => {
    gaslessEnabled.mockReturnValue(true)
    const { SettlementPendingError } = await import('~/lib/buy-gasless')
    buyManyGasless.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xrelayed1', salts: ['salt-1'] })
      opts.onBroadcast?.({ txHash: '0xrelayed2', salts: ['salt-2'] })
      return ['0xrelayed1', '0xrelayed2']
    })
    waitForSettlement.mockImplementation(async (hash: string) => {
      if (hash === '0xrelayed2') throw new SettlementPendingError('still pending')
    })

    renderCart([item('a'), item('b')])
    await pay()

    // Pending is NOT a failure: the reconciler settles it against the indexed CreditUsed event, so the
    // checkout completes and nothing is released.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/success', expect.anything()))
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })
})

/**
 * The "Creator" chip exists to tell a MINT apart from a RESALE. With resales switched off, every line in
 * every cart is a mint, so the chip labels all of them with the same word and says nothing — which is why
 * it is gated rather than merely styled differently.
 */
/**
 * The purchase summary states the total on the line directly above the button, so the button restating it
 * put the same figure on screen twice a centimetre apart. The item flow keeps its amount — there the button
 * is the only place the price appears.
 */
describe('when the cart summary offers the credits rail', () => {
  it('should not repeat the total inside the pay button', async () => {
    renderCart([item('a')])
    const cta = await screen.findByTestId('pay-with-credits')
    // No digits at all: the button names the action, the summary names the amount.
    expect(cta.textContent ?? '').not.toMatch(/\d/)
  })
})

/**
 * The route to buying more credits must not depend on the wallet's contents. The summary used to pick its
 * CTAs off whichever rails were payable, so a short credits balance removed the credits button entirely.
 *
 * Only the no-MANA case lives here: this file mocks `usdCentsToManaWei` to 0n, so a MANA rail can never
 * exist in it. The MANA combinations — including the reported bug, where held-but-insufficient MANA left
 * ONLY a disabled button — are covered in PaymentCtas.spec.tsx, where they can be set up directly.
 */
describe('when the credits balance cannot cover the cart', () => {
  it('should still offer the credits CTA, so a top-up is reachable', async () => {
    balance.cents = 100 // 10 credits against a 20-credit cart
    renderCart([item('a')])

    expect(await screen.findByTestId('pay-with-credits-topup')).toBeInTheDocument()
  })

  it('should not duplicate it once the balance does cover the cart', async () => {
    renderCart([item('a')])

    expect(await screen.findByTestId('pay-with-credits')).toBeInTheDocument()
    expect(screen.queryByTestId('pay-with-credits-topup')).not.toBeInTheDocument()
  })
})

describe('when a cart line is a primary (mint) listing', () => {
  it('should hide the Creator chip while secondary sales are off', async () => {
    secondarySales.on = false
    renderCart([item('a')])
    expect(await screen.findByText('Item a')).toBeTruthy()
    expect(screen.queryByTestId('cart-creator-tag')).toBeNull()
  })

  it('should show the Creator chip once secondary sales are on', async () => {
    secondarySales.on = true
    renderCart([item('a')])
    expect(await screen.findByTestId('cart-creator-tag')).toBeTruthy()
  })
})

/**
 * EVERY line goes out gaslessly, mint included.
 *
 * A basket holding a CollectionStore mint used to be pushed onto the buyer's own gas-paying transaction,
 * because the relayed rail only knew how to build `accept([...])`. For this shop that is the wrong default:
 * a web2 buyer holds no POL and has never heard of Polygon, so "submit it yourself" is not a route they have.
 * Measured in production — a mint at 0xf906…6213 failed for a buyer whose wallet was on Ethereum while a
 * trade at 0x5862…a212 went through for the same person, in the same session.
 */
describe('when the basket contains a store mint', () => {
  it('should relay it instead of asking the buyer to submit a transaction', async () => {
    gaslessEnabled.mockReturnValue(true)
    buyManyGasless.mockResolvedValue(['0xmint'])

    renderCart([item('a', { tradeId: undefined })], storeLine)
    await pay()

    await waitFor(() => expect(buyManyGasless).toHaveBeenCalled())
    // The gas-paying rail is not touched: nothing is submitted from the buyer's own wallet.
    expect(buyManyWithCredits).not.toHaveBeenCalled()
    const relayed = buyManyGasless.mock.calls[0][0] as { purchases: { kind?: string }[] }
    expect(relayed.purchases.map(p => p.kind)).toEqual(['store'])
  })

  /**
   * And when the relayer itself is down, a MANAGED wallet must not be handed the gas-paying rail as a
   * consolation: it holds no POL, so that path reverts with INSUFFICIENT_FUNDS after a prompt the buyer
   * cannot act on — and network/gas wording is exactly what these users must never see.
   */
  it('should not fall back to the gas-paying rail for a managed wallet', async () => {
    const { GaslessUnavailableError } = await import('~/lib/buy-gasless')
    gaslessEnabled.mockReturnValue(true)
    buyManyGasless.mockRejectedValue(new GaslessUnavailableError('relayer 503', 'relayer-rejected'))
    const previous = session.providerType
    session.providerType = 'magic' as never

    try {
      renderCart([item('a', { tradeId: undefined })], storeLine)
      await pay()

      await waitFor(() => expect(buyManyGasless).toHaveBeenCalled())
      expect(buyManyWithCredits).not.toHaveBeenCalled()
    } finally {
      session.providerType = previous
    }
  })

  it('should still offer the gas-paying rail to a self-custody wallet', async () => {
    const { GaslessUnavailableError } = await import('~/lib/buy-gasless')
    gaslessEnabled.mockReturnValue(true)
    buyManyGasless.mockRejectedValue(new GaslessUnavailableError('relayer 503', 'relayer-rejected'))
    buyManyWithCredits.mockResolvedValue(['0xdirect'])

    renderCart([item('a', { tradeId: undefined })], storeLine)
    await pay()

    // This buyer CAN pay the fee, so the fallback is a real route for them.
    await waitFor(() => expect(buyManyWithCredits).toHaveBeenCalled())
  })
})
