import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { LegacyListing } from '~/lib/api'
import type { ManaRate } from '~/lib/mana-rate'

// MarketCheckout is a Buy-Now modal for a legacy (MANA-priced) listing. These specs cover the two
// branches with no e2e coverage: the low-balance bridge to Get Credits (the purchase→buy-credits
// funnel join) and the locked-price math (credits === ceil(usdCents / 10)). Everything below the
// authorize step (fetchTrade → authorizeUsdCredit) is stubbed so the modal renders offline.

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

beforeEach(() => {
  vi.clearAllMocks()
  fetchTrade.mockResolvedValue({ signer: '0xseller' })
  authorizeUsdCredit.mockResolvedValue({
    credit: { id: 'credit-1' },
    maxCreditedValue: '1000000000000000000',
    usdCents: 2700
  })
  cancelUsdIntents.mockResolvedValue(0)
  buyWithCredits.mockResolvedValue('0xhash')
  gaslessOn.value = false
  waitForSettlement.mockResolvedValue(undefined)
})

describe('when the buyer has enough credits for the locked price', () => {
  it('should show the locked price as ceil(usdCents / 10) credits with the dollar amount', async () => {
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })

    renderModal()

    // Locks $27.00 → ceil(2700 / 10) = 270 credits. The amount and its unit are separate nodes (the
    // number renders through <Price>), so match on the element's combined text.
    expect(
      await screen.findByText((_, el) => el?.textContent?.replace(/\s+/g, ' ').trim() === '270 credits')
    ).toBeInTheDocument()
    expect(screen.getByText(/\$27\.00/)).toBeInTheDocument()
    // Enough balance → the primary action is Confirm, not the Get-credits bridge.
    expect(screen.getByRole('button', { name: /confirm purchase/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^buy credits$/i })).not.toBeInTheDocument()
  })
})

describe('when the buyer does not have enough credits for the locked price', () => {
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

  it('should bridge to Get Credits: release the reservation, fire the prompt event, and navigate to /credits', async () => {
    const user = userEvent.setup()
    useBalance.mockReturnValue({ data: { balanceCents: 50, credits: 5 }, isError: false })

    renderModal()

    // The CTA flips to the top-up action once the low balance is known against the locked 270.
    const cta = await screen.findByRole('button', { name: /buy credits/i })
    await user.click(cta)

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/credits'))
    // The reserved dollars are released so the balance isn't stuck until the TTL.
    expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1'])
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
    // The case the cleanup exists for: the price locked, the buyer walked away without confirming.
    manaWeiToUsdCents.mockReturnValue(2700)
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })

    const { unmount } = renderModal()
    await waitFor(() => expect(authorizeUsdCredit).toHaveBeenCalled())
    unmount()

    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
  })
})
