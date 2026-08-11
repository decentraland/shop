import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { LegacyListing } from '~/lib/api'
import type { ManaRate } from '~/lib/mana-rate'

// MarketCheckout is a Buy-Now modal for a legacy (MANA-priced) listing. These specs cover the branches
// with no e2e coverage: WHEN the dollars get reserved (on the confirm click, never on open), the price
// math (credits === ceil(usdCents / 10), and the dollars shown must be the dollars charged), the
// low-balance bridge to Get Credits, and the release decision after a failed submit. Everything the
// modal talks to (fetchTrade → authorizeUsdCredit → the buy rails) is stubbed so it renders offline.

const session = {
  address: '0xbuyer000000000000000000000000000000000001',
  chainId: 80002,
  signer: {} as never,
  web3Provider: {} as never,
  identity: {} as never,
  providerType: 'injected' as never
}
vi.mock('~/store/wallet', () => ({ useWallet: () => ({ session }) }))

// useBalance is overridden per test; balanceLabel stays real (it's the display fn under test elsewhere).
const { useBalance } = vi.hoisted(() => ({ useBalance: vi.fn() }))
vi.mock('~/hooks/useBalance', async orig => ({ ...(await orig<Record<string, unknown>>()), useBalance }))

// getUsdBalance is imported by useBalance.ts (not called here); the money seam we DO drive is authorize
// + cancel. Stub the module so nothing hits the credits-server.
const { authorizeUsdCredit, cancelUsdIntents } = vi.hoisted(() => ({
  authorizeUsdCredit: vi.fn(),
  cancelUsdIntents: vi.fn().mockResolvedValue(0)
}))
vi.mock('~/lib/credits', () => ({ authorizeUsdCredit, cancelUsdIntents, getUsdBalance: vi.fn(), devMintUsd: vi.fn() }))

const { fetchTrade } = vi.hoisted(() => ({ fetchTrade: vi.fn() }))
vi.mock('~/lib/api', async orig => ({ ...(await orig<Record<string, unknown>>()), fetchTrade }))

// The USD sizing is stubbed so the locked-price math is deterministic and the $0-guard is satisfied.
// Fully mocked (not partial): the real mana-rate module transitively imports decentraland-transactions,
// whose ESM directory import doesn't resolve under vitest's node resolver.
const { manaWeiToUsdCents } = vi.hoisted(() => ({ manaWeiToUsdCents: vi.fn(() => 2700) }))
vi.mock('~/lib/mana-rate', () => ({
  manaWeiToUsdCents,
  manaWeiToCredits: vi.fn(),
  manaWeiToUsdWei: vi.fn()
}))

vi.mock('~/lib/ownership', () => ({ isOwnTrade: () => false }))
// The gasless rail is the production DEFAULT and was previously hard-mocked off, so nothing exercised it —
// which is where the broadcast bookkeeping lives. `gaslessOn` lets a test pick the rail.
// Declared inside vi.hoisted so the mock factories (which are hoisted above module scope) can reach them.
const { buyWithCredits, buyGasless, waitForSettlement, gaslessOn, GaslessUnavailable, SettlementPending } = vi.hoisted(
  () => ({
    buyWithCredits: vi.fn(),
    buyGasless: vi.fn(),
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
  })
)
vi.mock('~/lib/gasless-config', () => ({ gaslessEnabled: () => gaslessOn.value }))
vi.mock('~/lib/buy', () => ({ buyWithCredits }))
vi.mock('~/lib/buy-gasless', () => ({
  buyGasless,
  waitForSettlement,
  GaslessUnavailableError: GaslessUnavailable,
  SettlementPendingError: SettlementPending
}))

const { track, errorCode, isUserRejection } = vi.hoisted(() => ({
  track: vi.fn(),
  errorCode: vi.fn(() => 'ERR'),
  isUserRejection: vi.fn(() => false)
}))
vi.mock('~/lib/analytics', () => ({ track, errorCode, isUserRejection }))

// Mutable so both sides of the iOS web-view gate are reachable.
const iap = { on: false }
vi.mock('~/lib/iap', () => ({ isIapMode: () => iap.on }))

const navigate = vi.fn()
vi.mock('react-router-dom', async orig => ({ ...(await orig<Record<string, unknown>>()), useNavigate: () => navigate }))

import { MarketCheckout } from '~/components/MarketCheckout'

const listing = {
  tradeId: 'trade-1',
  name: 'Nebula Jacket',
  creator: '0xcreator',
  contractAddress: '0xcontract',
  itemId: '1',
  category: 'wearable',
  wearableCategory: 'upper_body',
  rarity: 'epic',
  network: 'MATIC',
  chainId: 80002,
  thumbnail: '',
  manaWei: '1000000000000000000'
} as unknown as LegacyListing

const rate: ManaRate = { rate: 26960836n, decimals: 8 }

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MarketCheckout listing={listing} rate={rate} onClose={vi.fn()} onSold={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// The amount and its unit are separate nodes (the number renders through <Price>), so the price reads
// off an element's combined text rather than a single text node.
function priceMatcher(expected: string) {
  return (_: string, el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() === expected
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchTrade.mockResolvedValue({ signer: '0xseller' })
  // ECHOES the requested price, rounded up to a whole credit — exactly what the credits-server does
  // (`Math.ceil(rawPrice / 10) * 10`). A fixed number would silently disagree with the quote this modal
  // showed, which is a real condition it now refuses to charge through.
  authorizeUsdCredit.mockImplementation(async (_identity: unknown, usdPriceCents: number) => ({
    credit: { id: 'credit-1' },
    maxCreditedValue: '1000000000000000000',
    usdCents: Math.ceil(usdPriceCents / 10) * 10
  }))
  cancelUsdIntents.mockResolvedValue(0)
  buyWithCredits.mockResolvedValue('0xhash')
  gaslessOn.value = false
  waitForSettlement.mockResolvedValue(undefined)
})

describe('when the buyer has enough credits for the price', () => {
  it('should show the price as ceil(usdCents / 10) credits with the dollar amount', async () => {
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })

    renderModal()

    // $27.00 → ceil(2700 / 10) = 270 credits.
    expect(await screen.findByText(priceMatcher('270 credits'))).toBeInTheDocument()
    expect(screen.getByText(/\$27\.00/)).toBeInTheDocument()
    // Enough balance → the primary action is Confirm, not the Get-credits bridge.
    expect(screen.getByRole('button', { name: /confirm purchase/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^buy credits$/i })).not.toBeInTheDocument()
  })
})

/**
 * WHEN THE DOLLARS ARE RESERVED.
 *
 * An ephemeral credit is SIGNED, and a signed credit cannot be revoked: it stays spendable until its own
 * expiry whatever the client does afterwards, and the balance keeps subtracting it for that whole time.
 * A reservation made when this modal OPENED therefore froze the listing's price out of the buyer's
 * balance for minutes just for looking, and closing the modal could not give it back any sooner.
 */
describe('when the checkout is opened', () => {
  const openIt = async () => {
    manaWeiToUsdCents.mockReturnValue(2700)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })
    const rendered = renderModal()
    const cta = await screen.findByRole('button', { name: /confirm purchase/i })
    await waitFor(() => expect(cta).not.toBeDisabled())
    return { ...rendered, cta }
  }

  it('should reserve nothing, while still showing the price', async () => {
    await openIt()

    // The price is ours: the server charges what it is sent, rounded up to a whole credit — the same
    // rounding this figure already carries. Nothing about showing it needs a credit to be minted.
    expect(screen.getByText(priceMatcher('270 credits'))).toBeInTheDocument()
    expect(authorizeUsdCredit).not.toHaveBeenCalled()
  })

  it('should reserve nothing however many times it is opened and closed', async () => {
    for (let i = 0; i < 5; i++) {
      const { unmount } = await openIt()
      unmount()
    }

    expect(authorizeUsdCredit).not.toHaveBeenCalled()
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should reserve exactly once when the buyer confirms, and buy with it', async () => {
    const user = userEvent.setup()
    const { cta } = await openIt()

    await user.click(cta)

    await waitFor(() => expect(buyWithCredits).toHaveBeenCalled())
    expect(authorizeUsdCredit).toHaveBeenCalledTimes(1)
    expect(authorizeUsdCredit).toHaveBeenCalledWith(session.identity, 2700, 'trade-1')
  })
})

/**
 * The price the buyer agreed to is the price they get charged.
 *
 * The credits-server hands back an EXISTING live credit for the same purchase rather than minting a
 * second one, and that one was priced at an earlier oracle read — so what comes back CAN differ from
 * what this modal showed. Charging it anyway would take money for a number the buyer never saw.
 */
describe('when the reservation comes back at a different price', () => {
  const AT_3300 = { credit: { id: 'credit-1' }, maxCreditedValue: '1000000000000000000', usdCents: 3300 }

  const confirmOnce = async () => {
    const user = userEvent.setup()
    manaWeiToUsdCents.mockReturnValue(2700)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })
    authorizeUsdCredit.mockResolvedValueOnce(AT_3300)
    renderModal()
    const cta = await screen.findByRole('button', { name: /confirm purchase/i })
    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)
    return { user, cta }
  }

  it('should not buy anything, and should show the price it would actually charge', async () => {
    await confirmOnce()

    expect(await screen.findByTestId('price-changed')).toBeInTheDocument()
    expect(screen.getByText(priceMatcher('330 credits'))).toBeInTheDocument()
    expect(buyWithCredits).not.toHaveBeenCalled()
  })

  it('should spend the credit it already holds when the buyer agrees, not a second one', async () => {
    const { user, cta } = await confirmOnce()
    await screen.findByTestId('price-changed')

    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)

    await waitFor(() => expect(buyWithCredits).toHaveBeenCalled())
    expect(authorizeUsdCredit).toHaveBeenCalledTimes(1)
  })
})

/**
 * A live oracle rate almost never lands on a 10-cent mark, so this is nearly every legacy listing.
 */
describe('when the listing converts to a fraction of a credit', () => {
  it('should show the dollar amount the buyer is actually charged, not the pre-rounding one', async () => {
    // 2734 cents is 274 credits, and 274 whole credits is $27.40 — the server rounds UP, so rendering the
    // raw $27.34 would understate the debit.
    manaWeiToUsdCents.mockReturnValue(2734)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })

    renderModal()

    expect(await screen.findByText(priceMatcher('274 credits'))).toBeInTheDocument()
    expect(screen.getByText(/\$27\.40/)).toBeInTheDocument()
    expect(screen.queryByText(/\$27\.34/)).toBeNull()
  })

  it('should still charge exactly what it showed', async () => {
    const user = userEvent.setup()
    manaWeiToUsdCents.mockReturnValue(2734)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })

    renderModal()
    const cta = await screen.findByRole('button', { name: /confirm purchase/i })
    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)

    // The raw cents go to the server, which rounds them up to the 274 credits already on screen — so the
    // price-change guard stays quiet and the purchase goes through.
    await waitFor(() => expect(buyWithCredits).toHaveBeenCalled())
    expect(authorizeUsdCredit).toHaveBeenCalledWith(session.identity, 2734, 'trade-1')
    expect(screen.queryByTestId('price-changed')).toBeNull()
  })
})

/**
 * The authorize is a signed round-trip and now runs on the click, so the buyer can leave while it is in
 * flight — when there is no credit id yet for the unmount cleanup to release.
 */
describe('when the buyer leaves while the reservation is being made', () => {
  it('should release it rather than buy on a modal that is gone', async () => {
    const user = userEvent.setup()
    manaWeiToUsdCents.mockReturnValue(2700)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })
    let settle: (v: unknown) => void = () => undefined
    authorizeUsdCredit.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          settle = resolve
        })
    )

    const { unmount } = renderModal()
    const cta = await screen.findByRole('button', { name: /confirm purchase/i })
    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)
    await waitFor(() => expect(authorizeUsdCredit).toHaveBeenCalled())
    unmount()
    settle({ credit: { id: 'credit-1' }, maxCreditedValue: '1000000000000000000', usdCents: 2700 })

    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
    expect(buyWithCredits).not.toHaveBeenCalled()
  })
})

describe('when the buyer does not have enough credits for the price', () => {
  /**
   * Inside the iOS app's web view the bridge cannot exist: it routes to the pack picker, and Apple requires
   * digital currency to be sold through In-App Purchase. So the CTA stops offering a way out it cannot
   * deliver — the shortfall note still says what is missing, which makes it an explained dead end rather
   * than a silent one.
   */
  describe('and the shop is running in the iOS web view', () => {
    beforeEach(() => {
      iap.on = true
      useBalance.mockReturnValue({ data: { balanceCents: 50, credits: 5 }, isError: false })
    })

    afterEach(() => {
      iap.on = false
    })

    it('should not offer the Get Credits bridge', async () => {
      renderModal()

      await screen.findByRole('button', { name: /confirm purchase/i })
      expect(screen.queryByRole('button', { name: /buy credits/i })).not.toBeInTheDocument()
    })

    it('should disable the action rather than route to the pack picker', async () => {
      renderModal()

      const cta = await screen.findByRole('button', { name: /confirm purchase/i })
      expect(cta).toBeDisabled()
      expect(navigate).not.toHaveBeenCalledWith('/credits')
    })

    it('should still tell the buyer they are short', async () => {
      renderModal()

      await screen.findByRole('button', { name: /confirm purchase/i })
      expect(screen.getByText(/need a few more/i)).toBeInTheDocument()
    })
  })

  it('should bridge to Get Credits: reserve nothing, fire the prompt event, and navigate to /credits', async () => {
    const user = userEvent.setup()
    useBalance.mockReturnValue({ data: { balanceCents: 50, credits: 5 }, isError: false })

    renderModal()

    // The CTA flips to the top-up action once the low balance is known against the quoted 270.
    const cta = await screen.findByRole('button', { name: /buy credits/i })
    await user.click(cta)

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/credits'))
    // Nothing was ever reserved, so there is nothing to hand back — which is the point: this buyer's
    // balance was never touched by a purchase they could not make.
    expect(authorizeUsdCredit).not.toHaveBeenCalled()
    expect(cancelUsdIntents).not.toHaveBeenCalled()
    // Funnel join: a purchase blocked by low balance that routes to top-up.
    const prompted = track.mock.calls.find(c => c[0] === 'Shop Buy Credits Prompted')
    expect(prompted?.[1]).toMatchObject({
      from: 'item_checkout',
      credits_needed: 270,
      credits_balance: 5,
      shortfall: 265
    })
  })

  it('should not lock a free purchase when the price sizes to $0 (bad rate / manaWei)', async () => {
    manaWeiToUsdCents.mockReturnValue(0)
    useBalance.mockReturnValue({ data: { balanceCents: 50, credits: 5 }, isError: false })

    renderModal()

    // Guard: usdCents <= 0 → error, never a locked $0 buy (authorize is never reached).
    expect(await screen.findByText(/price unavailable|couldn.?t complete/i)).toBeInTheDocument()
    expect(authorizeUsdCredit).not.toHaveBeenCalled()
    // The Confirm button stays disabled because the price never locked.
    expect(screen.getByRole('button', { name: /confirm purchase/i })).toBeDisabled()
  })
})

/**
 * THE RELEASE DECISION after the transaction is already out.
 *
 * This modal releases its reservation whenever the buy throws, which is right only while nothing has been
 * broadcast. Releasing a credit that is consumed on-chain hands the buyer back money they have already spent:
 * the balance rises, the reconciler debits it again once the squid indexes the consumption, and anything they
 * buy in that gap drives the balance negative.
 */
describe('when the transaction has already been broadcast', () => {
  const confirmPurchase = async () => {
    const user = userEvent.setup()
    // Re-stated per test: vi.clearAllMocks() clears calls but NOT implementations, so the $0-price case above
    // would otherwise leak in and leave Confirm disabled.
    manaWeiToUsdCents.mockReturnValue(2700)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })
    renderModal()
    const cta = await screen.findByRole('button', { name: /confirm purchase/i })
    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)
  }

  it('should NOT release the reservation when settlement fails after the broadcast', async () => {
    // The buyer hits "Speed up" in their wallet: ethers rejects with TRANSACTION_REPLACED even though the
    // replacement mined and consumed the credit. No receipt, so no revert signal — the pessimistic case.
    buyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast' })
      throw new Error('transaction was replaced')
    })

    await confirmPurchase()

    await waitFor(() => expect(track).toHaveBeenCalledWith('Shop Purchase Failed', expect.anything()))
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should release the reservation when the transaction reverted', async () => {
    // Status 0 rolled the call back, so the credit was never consumed: releasing is correct, and NOT
    // releasing strands that much of the buyer's balance until the TTL.
    buyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast' })
      // The revert carries ITS hash: a credit can back more than one transaction, so "a revert happened" is
      // not the same statement as "this credit is untouched".
      opts.onReverted?.({ txHash: '0xbroadcast' })
      throw new Error('transaction failed')
    })

    await confirmPurchase()

    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
  })

  it('should still release when nothing was broadcast', async () => {
    // The pre-existing behaviour, which must not regress: a rejected signature spends nothing.
    buyWithCredits.mockRejectedValue(new Error('user rejected transaction'))

    await confirmPurchase()

    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
  })

  /**
   * The path that needed no race at all: `track` and the cache invalidations used to sit INSIDE the try, so
   * any throw from them landed in the catch and released a credit consumed seconds earlier.
   */
  it('should neither release nor show an error when post-purchase bookkeeping throws', async () => {
    buyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast' })
      return '0xhash'
    })
    track.mockImplementation((event: string) => {
      if (event === 'Shop Completed Purchase') throw new Error('segment blew up')
    })

    await confirmPurchase()

    // The purchase happened, so the buyer still lands on /success and nothing is handed back.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/success', expect.anything()))
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })
})

/**
 * A RETRY reuses the same reservation, and that is what breaks a single broadcast flag.
 *
 * The Confirm CTA stays enabled on the error phase (`disabled={busy || !locked}`, and `busy` is only the
 * working phase), so the buyer can press it again with the same `locked.credit`.
 */
describe('when the buyer retries after an unresolved attempt', () => {
  it('should NOT release even though the retry reverted', async () => {
    const user = userEvent.setup()
    manaWeiToUsdCents.mockReturnValue(2700)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })
    let attempt = 0
    buyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      attempt += 1
      if (attempt === 1) {
        // Went out; outcome never observed (replaced transaction / dropped socket).
        opts.onBroadcast?.({ txHash: '0xfirst' })
        throw new Error('transaction was replaced')
      }
      // The retry mines and REVERTS — because the FIRST attempt actually filled the trade.
      opts.onBroadcast?.({ txHash: '0xsecond' })
      opts.onReverted?.({ txHash: '0xsecond' })
      throw new Error('transaction failed')
    })

    renderModal()
    const cta = await screen.findByRole('button', { name: /confirm purchase/i })
    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)
    await waitFor(() => expect(buyWithCredits).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)
    await waitFor(() => expect(buyWithCredits).toHaveBeenCalledTimes(2))

    // The second revert says nothing about the first attempt, which may well have consumed the credit.
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })
})

/**
 * The Confirm CTA stays enabled on the error phase, and `confirm` now reserves only when it is holding
 * nothing. So a released credit left in hand would be re-submitted on every retry, against an intent the
 * server has already retired — a retry that can never succeed.
 */
describe('when the buyer retries after a failure that released the reservation', () => {
  it('should reserve again rather than re-submit the released credit', async () => {
    const user = userEvent.setup()
    manaWeiToUsdCents.mockReturnValue(2700)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })
    // Nothing broadcast, so the release goes through.
    buyWithCredits.mockRejectedValue(new Error('user rejected transaction'))

    renderModal()
    const cta = await screen.findByRole('button', { name: /confirm purchase/i })
    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)
    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))

    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)

    await waitFor(() => expect(authorizeUsdCredit).toHaveBeenCalledTimes(2))
  })

  /**
   * But only when the release actually LANDED. Firing the cancel is not the same as the server accepting
   * it: on a 5xx the credit is still live and still counted against the balance, so minting a second one
   * would tell a buyer who has the money that they cannot afford the item until the TTL runs out.
   */
  it('should keep the credit and not reserve again when the cancel failed', async () => {
    const user = userEvent.setup()
    manaWeiToUsdCents.mockReturnValue(2700)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })
    buyWithCredits.mockRejectedValue(new Error('user rejected transaction'))
    cancelUsdIntents.mockRejectedValue(new Error('cancelUsdIntents 503: Service Unavailable'))

    renderModal()
    const cta = await screen.findByRole('button', { name: /confirm purchase/i })
    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)
    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))

    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)
    await waitFor(() => expect(buyWithCredits).toHaveBeenCalledTimes(2))

    // The retry re-submits the credit it is still holding instead of minting a second one.
    expect(authorizeUsdCredit).toHaveBeenCalledTimes(1)
  })
})

/**
 * THE GASLESS RAIL — enabled by default in production, and previously untested here.
 */
describe('when buying through the relayer', () => {
  const confirmGasless = async () => {
    const user = userEvent.setup()
    gaslessOn.value = true
    manaWeiToUsdCents.mockReturnValue(2700)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })
    renderModal()
    const cta = await screen.findByRole('button', { name: /confirm purchase/i })
    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)
  }

  it('should NOT release while a relayed transaction may still land', async () => {
    buyGasless.mockResolvedValue('0xrelayed')
    waitForSettlement.mockRejectedValue(new SettlementPending('still pending'))

    await confirmGasless()

    // Pending is not a failure: the reconciler settles it against the indexed CreditUsed event.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/success', expect.anything()))
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should release when the relayed transaction reverted', async () => {
    buyGasless.mockResolvedValue('0xrelayed')
    // waitForSettlement throws a plain Error only for a status-0 receipt: nothing consumed.
    waitForSettlement.mockRejectedValue(new Error('transaction reverted'))

    await confirmGasless()

    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
  })

  it('should fall back to the direct rail when the relayer REFUSED, and release if that fails', async () => {
    // A parsed rejection proves nothing was relayed, so re-using the credit is safe.
    buyGasless.mockRejectedValue(new GaslessUnavailable('relayer 400', 'relayer-rejected'))
    buyWithCredits.mockRejectedValue(new Error('user rejected transaction'))

    await confirmGasless()

    await waitFor(() => expect(buyWithCredits).toHaveBeenCalled())
    expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1'])
  })

  /**
   * THE P1. An unreachable relayer is not a refusal: it may have submitted before the connection died, and
   * there is no hash to key a later revert on. Re-submitting the same credit would estimate gas against an
   * already-consumed credit, revert with no receipt, and look exactly like a pre-broadcast failure.
   */
  it('should neither re-submit nor release when the relayer was unreachable', async () => {
    buyGasless.mockRejectedValue(new GaslessUnavailable('ECONNRESET', 'relayer-unreachable'))

    await confirmGasless()

    await waitFor(() => expect(track).toHaveBeenCalledWith('Shop Purchase Failed', expect.anything()))
    expect(buyWithCredits).not.toHaveBeenCalled()
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })
})

/**
 * The unmount path needs a stricter rule than the buy's own catch: it can fire WHILE the submit is awaiting,
 * when nothing has been reported yet — the wallet prompt is open, or the relayer is mid-round-trip.
 */
describe('when the modal goes away mid-purchase', () => {
  it('should not release a reservation whose submit is still in flight', async () => {
    const user = userEvent.setup()
    manaWeiToUsdCents.mockReturnValue(2700)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })
    // Never settles: the wallet prompt is still open, so no broadcast has been reported.
    buyWithCredits.mockImplementation(() => new Promise(() => {}))

    const { unmount } = renderModal()
    const cta = await screen.findByRole('button', { name: /confirm purchase/i })
    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)
    await waitFor(() => expect(buyWithCredits).toHaveBeenCalled())
    unmount()

    // The buyer may be about to confirm in their wallet. Releasing here hands back a credit that is then spent.
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should release a reservation that was never submitted', async () => {
    // A credit exists and nothing was ever sent with it. The only path that now holds one without
    // submitting: the authorize came back at a price the buyer had not agreed to, so the modal went back
    // and asked. They closed instead — and those dollars must come back.
    const user = userEvent.setup()
    manaWeiToUsdCents.mockReturnValue(2700)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })
    authorizeUsdCredit.mockResolvedValueOnce({
      credit: { id: 'credit-1' },
      maxCreditedValue: '1000000000000000000',
      usdCents: 3300
    })

    const { unmount } = renderModal()
    const cta = await screen.findByRole('button', { name: /confirm purchase/i })
    await waitFor(() => expect(cta).not.toBeDisabled())
    await user.click(cta)
    await waitFor(() => expect(authorizeUsdCredit).toHaveBeenCalledTimes(1))
    expect(buyWithCredits).not.toHaveBeenCalled()
    unmount()

    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
  })
})
