import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  providerType: 'injected' as never,
}
vi.mock('~/store/wallet', () => ({ useWallet: () => ({ session }) }))

// useBalance is overridden per test; balanceLabel stays real (it's the display fn under test elsewhere).
const { useBalance } = vi.hoisted(() => ({ useBalance: vi.fn() }))
vi.mock('~/hooks/useBalance', async orig => ({ ...(await orig<Record<string, unknown>>()), useBalance }))

// getUsdBalance is imported by useBalance.ts (not called here); the money seam we DO drive is authorize
// + cancel. Stub the module so nothing hits the credits-server.
const { authorizeUsdCredit, cancelUsdIntents } = vi.hoisted(() => ({
  authorizeUsdCredit: vi.fn(),
  cancelUsdIntents: vi.fn().mockResolvedValue(0),
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
  manaWeiToUsdWei: vi.fn(),
}))

vi.mock('~/lib/ownership', () => ({ isOwnTrade: () => false }))
vi.mock('~/lib/gasless-config', () => ({ gaslessEnabled: () => false }))
vi.mock('~/lib/buy', () => ({ buyWithCredits: vi.fn().mockResolvedValue('0xhash') }))
vi.mock('~/lib/buy-gasless', () => ({
  buyGasless: vi.fn(),
  waitForSettlement: vi.fn(),
  GaslessUnavailableError: class extends Error {},
  SettlementPendingError: class extends Error {},
}))

const { track, errorCode, isUserRejection } = vi.hoisted(() => ({
  track: vi.fn(),
  errorCode: vi.fn(() => 'ERR'),
  isUserRejection: vi.fn(() => false),
}))
vi.mock('~/lib/analytics', () => ({ track, errorCode, isUserRejection }))

const navigate = vi.fn()
vi.mock('react-router-dom', async orig => ({ ...(await orig<Record<string, unknown>>()), useNavigate: () => navigate }))

// eslint-disable-next-line import/first
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
  manaWei: '1000000000000000000',
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
    usdCents: 2700,
  })
  cancelUsdIntents.mockResolvedValue(0)
})

describe('when the buyer has enough credits for the locked price', () => {
  it('should show the locked price as ceil(usdCents / 10) credits with the dollar amount', async () => {
    useBalance.mockReturnValue({ data: { balanceCents: 100000, credits: 1000 }, isError: false })

    renderModal()

    // Locks $27.00 → ceil(2700 / 10) = 270 credits.
    expect(await screen.findByText('270 credits')).toBeInTheDocument()
    expect(screen.getByText(/\$27\.00/)).toBeInTheDocument()
    // Enough balance → the primary action is Confirm, not the Get-credits bridge.
    expect(screen.getByRole('button', { name: /confirm purchase/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^get credits$/i })).not.toBeInTheDocument()
  })
})

describe('when the buyer does not have enough credits for the locked price', () => {
  it('should bridge to Get Credits: release the reservation, fire the prompt event, and navigate to /credits', async () => {
    const user = userEvent.setup()
    useBalance.mockReturnValue({ data: { balanceCents: 50, credits: 5 }, isError: false })

    renderModal()

    // The CTA flips to "Get credits" once the low balance is known against the locked 270.
    const cta = await screen.findByRole('button', { name: /get credits/i })
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
      shortfall: 265,
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
