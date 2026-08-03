import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
vi.mock('~/hooks/useBalance', () => ({
  useBalance: () => ({ data: { balanceCents: 100_000, credits: 10_000 } })
}))
vi.mock('~/hooks/useManaBalance', () => ({ useManaBalance: () => ({ data: 0n }) }))
vi.mock('~/hooks/useCreditPacks', () => ({ useCreditPacks: () => ({ packs: [] }) }))

const { authorizeUsdCredit, cancelUsdIntents } = vi.hoisted(() => ({
  authorizeUsdCredit: vi.fn(),
  cancelUsdIntents: vi.fn()
}))
vi.mock('~/lib/credits', () => ({ authorizeUsdCredit, cancelUsdIntents, getUsdBalance: vi.fn() }))

// The seam under test: a driver that reports outcomes through the real callbacks.
const { buyWithCredits } = vi.hoisted(() => ({ buyWithCredits: vi.fn() }))
vi.mock('~/lib/buy', () => ({ buyWithCredits }))
vi.mock('~/lib/buy-mana', () => ({ buyWithMana: vi.fn(), buyWithCreditsAndMana: vi.fn() }))
vi.mock('~/lib/gasless-config', () => ({ gaslessEnabled: () => false }))
vi.mock('~/lib/buy-gasless', () => ({
  buyGasless: vi.fn(),
  waitForSettlement: vi.fn(),
  GaslessUnavailableError: class GaslessUnavailableError extends Error {},
  SettlementPendingError: class SettlementPendingError extends Error {}
}))

const { resolveLiveTrade } = vi.hoisted(() => ({ resolveLiveTrade: vi.fn() }))
vi.mock('~/lib/api', async orig => ({ ...(await orig<Record<string, unknown>>()), resolveLiveTrade }))
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
function renderResuming() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BuyModal item={item} onClose={vi.fn()} resume />
      </MemoryRouter>
    </QueryClientProvider>
  )
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
  authorizeUsdCredit.mockResolvedValue({
    credit: { id: 'credit-1' },
    maxCreditedValue: '1000000000000000000',
    usdCents: 2700
  })
  buyWithCredits.mockResolvedValue('0xhash')
})

describe('when the buy fails after the transaction was broadcast', () => {
  it('should NOT release the reservation', async () => {
    // No receipt to read (a replaced or dropped transaction), so the outcome is unknown and the credit may
    // well be consumed. The pessimistic side is the only safe one.
    buyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast' })
      throw new Error('transaction was replaced')
    })

    renderResuming()

    await waitFor(() => expect(track).toHaveBeenCalledWith('Shop Purchase Failed', expect.anything()))
    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should release when the transaction reverted, because nothing was consumed', async () => {
    buyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
      opts.onBroadcast?.({ txHash: '0xbroadcast' })
      opts.onReverted?.()
      throw new Error('transaction failed')
    })

    renderResuming()

    // Releasing is not merely allowed here, it is required: otherwise that much of the buyer's balance is
    // stranded until the TTL expires.
    await waitFor(() => expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1']))
  })

  it('should still release when nothing was broadcast', async () => {
    // The pre-existing behaviour, which must not regress: a rejected signature spends nothing.
    buyWithCredits.mockRejectedValue(new Error('user rejected transaction'))

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
    buyWithCredits.mockImplementation(async (opts: Record<string, any>) => {
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
 * The third release site: the effect cleanup on unmount.
 *
 * `reservedCreditIdRef` is only cleared once the buy resolves, so closing the modal (or navigating away) with
 * a transaction in flight used to reach `cancelUsdIntents` with a credit that was already on its way.
 */
describe('when the modal unmounts with a transaction in flight', () => {
  it('should not release a reservation whose transaction was broadcast', async () => {
    let broadcast: (() => void) | undefined
    buyWithCredits.mockImplementation(
      (opts: Record<string, any>) =>
        new Promise(() => {
          // Report the broadcast, then never settle — the modal is unmounted mid-flight below.
          broadcast = () => opts.onBroadcast?.({ txHash: '0xbroadcast' })
          broadcast()
        })
    )

    const { unmount } = renderResuming()
    await waitFor(() => expect(buyWithCredits).toHaveBeenCalled())
    unmount()

    expect(cancelUsdIntents).not.toHaveBeenCalled()
  })

  it('should release a reservation that never made it to a transaction', async () => {
    // Locked the price, nothing submitted yet: this is the case the cleanup exists for, and it must keep
    // working — otherwise every abandoned modal strands the buyer's balance for the whole TTL.
    buyWithCredits.mockImplementation(() => new Promise(() => {}))

    const { unmount } = renderResuming()
    await waitFor(() => expect(buyWithCredits).toHaveBeenCalled())
    unmount()

    expect(cancelUsdIntents).toHaveBeenCalledWith(session.identity, ['credit-1'])
  })
})
