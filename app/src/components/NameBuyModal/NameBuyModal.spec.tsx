import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RESUME_NAME_KEY } from '~/lib/resume-name'
import { WrongNetworkError } from '~/lib/network'
import { RESUME_BUY_KEY } from '~/lib/resume-buy'
import { RESUME_CART_KEY } from '~/lib/cart-checkout'

import { NameBuyModal } from './NameBuyModal'
// Resolves to the MOCKED module below, which is what makes the modal's `instanceof` check meaningful here:
// both sides get the same class object.
import { NameNotRegisteredError, NameRouteCostTooHighError, NameSettlementUnknownError } from '~/lib/names'

/**
 * The NAME purchase modal — the last step of a CROSS-CHAIN money path, and the layer that decides what the
 * buyer is told about it.
 *
 * `registerNameWithUsdCredits` reports two distinct successful outcomes: `registered` (the NAME was minted
 * on Ethereum) and `pending` (the credit was spent on Polygon but the Across fill has not landed inside the
 * polling window). Treating them alike is not a cosmetic slip — it tells someone their NAME is in My Items
 * when it is not there yet.
 *
 * These cases also pin what the CTA refuses to submit. The price only exists while the MANA/USD oracle
 * answers, and it is paid from a credit balance, so "the re-typed name matches" is not enough to let the
 * purchase through.
 */

// Mocked WITHOUT importOriginal: the real module pulls in decentraland-transactions, whose ESM entry fails
// to resolve under vitest (ERR_UNSUPPORTED_DIR_IMPORT). The error class is defined inside the factory so it
// is not read during hoisting, and the spec imports it back from here.
const registerNameWithUsdCredits = vi.fn()
const registerNameWithEthereumMana = vi.fn()
vi.mock('~/lib/names', () => {
  class NameRouteCostTooHighError extends Error {
    constructor() {
      // Deliberately NOT the user-facing wording: if this said "network costs", the assertion below would
      // pass whether the modal used the dedicated copy or just echoed the error's own message.
      super('RAW_ROUTE_COST_INTERNAL')
      this.name = 'NameRouteCostTooHighError'
    }
  }
  class NameSettlementUnknownError extends Error {
    constructor() {
      super('RAW_UNKNOWN_INTERNAL')
      this.name = 'NameSettlementUnknownError'
    }
  }
  class NameGasNotPayableError extends Error {
    constructor() {
      super('RAW_GAS_INTERNAL')
      this.name = 'NameGasNotPayableError'
    }
  }
  class NameNotRegisteredError extends Error {
    constructor() {
      // Raw wording again, so the assertions below cannot pass by echoing the error's own message.
      super('RAW_NOT_REGISTERED_INTERNAL')
      this.name = 'NameNotRegisteredError'
    }
  }
  return {
    NameGasNotPayableError,
    NameRouteCostTooHighError,
    NameNotRegisteredError,
    NameSettlementUnknownError,
    registerNameWithUsdCredits: (...a: unknown[]) => registerNameWithUsdCredits(...a),
    registerNameWithEthereumMana: (...a: unknown[]) => registerNameWithEthereumMana(...a),
    // The fixed on-chain price the MANA rails are sized against.
    NAME_PRICE_IN_WEI: '100000000000000000000'
  }
})

// The buyer's own MANA, per chain. Zero by default so the existing cases keep exercising the credits-only
// flow they were written for; the MANA cases raise it.
const manaBalances = { data: { matic: 0n, ethereum: 0n } }
vi.mock('~/hooks/useManaBalance', () => ({ useManaBalances: () => manaBalances }))

const track = vi.fn()
vi.mock('~/lib/analytics', () => ({
  track: (...a: unknown[]) => track(...a),
  errorCode: () => 'x',
  isUserRejection: () => false,
  creditsToUsd: (credits: number) => Math.round(credits * 10) / 100
}))

// Mirrors the REAL shape: useBalance resolves a `UsdBalance` object, not a number. Mocking it as a bare
// number let an earlier version of the gate compile against the wrong type and still pass here — the spec
// has to speak the same language as production or it certifies nothing.
let balance: { balanceCents: number; credits: number } | undefined = { balanceCents: 5000, credits: 500 }
vi.mock('~/hooks/useBalance', () => ({
  useBalance: () => ({ data: balance, isError: false }),
  balanceLabel: (b?: { credits: number }) => (b == null ? '—' : String(b.credits))
}))

// The top-up path the no-funds screen offers: a pack catalogue, the Stripe checkout it starts, and the
// iOS web view where credits may not be sold at all.
const creditPacks: { packs: { id: string; credits: number; usd: number }[] } = { packs: [] }
vi.mock('~/hooks/useCreditPacks', () => ({ useCreditPacks: () => creditPacks }))
const createPackCheckout = vi.fn()
// `offerablePacks` comes from the REAL module: it is the covering/recommended rule these cases are about,
// and a hand-written copy here could disagree with what ships while every assertion still passed.
vi.mock('~/lib/payments', async orig => ({
  ...(await orig<Record<string, unknown>>()),
  createPackCheckout: (...a: unknown[]) => createPackCheckout(...a),
  MAX_OFFER_PACKS: 4
}))
const captureError = vi.fn()
vi.mock('~/lib/monitoring', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))
const iap = { on: false }
vi.mock('~/lib/iap', () => ({ isIapMode: () => iap.on }))

const session = {
  address: '0x1111111111111111111111111111111111111111',
  identity: {} as never,
  signer: {} as never,
  providerType: 'magic'
}
vi.mock('~/store/wallet', () => ({
  useWallet: (sel?: (s: unknown) => unknown) => {
    const state = { session }
    return sel ? sel(state) : state
  }
}))

// Where the modal routed to, for the mock-payments branch that has no hosted Stripe URL to redirect to.
function Location() {
  const { pathname } = useLocation()
  return <span data-testid="location">{pathname}</span>
}

function renderModal(priceCredits: number | null = 67, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NameBuyModal name="hodor" priceCredits={priceCredits} onClose={onClose} />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** The modal deliberately makes the buyer re-type the name; nothing submits until it matches. */
function reenter(name = 'hodor') {
  fireEvent.change(screen.getByLabelText(/re-?enter|confirm/i), { target: { value: name } })
}

const buyButton = () => screen.getByRole('button', { name: /buy name/i })

describe('NameBuyModal', () => {
  beforeEach(() => {
    registerNameWithUsdCredits.mockReset()
    registerNameWithEthereumMana.mockReset()
    track.mockReset()
    createPackCheckout.mockReset()
    captureError.mockReset()
    creditPacks.packs = []
    iap.on = false
    sessionStorage.clear()
    balance = { balanceCents: 5000, credits: 500 }
    manaBalances.data = { matic: 0n, ethereum: 0n }
    // Restored per test: the progress cases below switch it to cover both wallet kinds, and leaking that
    // would silently change which copy every later case is asserting.
    session.providerType = 'magic'
  })

  describe('and the registration settles on Ethereum', () => {
    it('should show the purchase-complete screen', async () => {
      registerNameWithUsdCredits.mockResolvedValue({
        status: 'registered',
        originTxHash: '0xorigin',
        destinationTxHash: '0xdest'
      })
      renderModal()
      reenter()

      fireEvent.click(buyButton())

      await waitFor(() => expect(screen.getByText(/purchase complete/i)).toBeTruthy())
      expect(screen.getByText(/successful/i)).toBeTruthy()
    })

    /** By this point the NAME is the buyer's, so it is shown as a card rather than the small @ square. */
    it('should present the NAME as a tile carrying its own name', async () => {
      registerNameWithUsdCredits.mockResolvedValue({
        status: 'registered',
        originTxHash: '0xorigin',
        destinationTxHash: '0xdest'
      })
      renderModal()
      reenter()

      fireEvent.click(buyButton())

      const tile = await waitFor(() => screen.getByTestId('name-success-tile'))
      // The name reads inside the tile as well as beside it.
      expect(tile.textContent ?? '').toContain('hodor')
    })
  })

  /**
   * Registering a NAME is ONE step, and the screen says so — except for a self-custody buyer, who has a
   * wallet prompt to answer before that step can start. The purchase is also cross-chain, and the bridge
   * leg runs for MINUTES: a screen that cannot say so reads as hung, which is the one thing a screen
   * holding someone's money must never look like.
   */
  describe('and the purchase is in progress', () => {
    // Drives the modal through the stages by hand and never resolves, so each message can be read while the
    // purchase is genuinely sitting in that stage.
    function renderAtStage(stage: string) {
      let report: ((s: string) => void) | undefined
      registerNameWithUsdCredits.mockImplementation((opts: { onProgress?: (s: string) => void }) => {
        report = opts.onProgress
        return new Promise(() => {})
      })
      renderModal(67)
      reenter()
      fireEvent.click(buyButton())
      return () => report?.(stage)
    }

    it('should ask a self-custody buyer to confirm while their wallet is waiting', async () => {
      session.providerType = 'injected'
      const advance = renderAtStage('awaiting-confirmation')

      await waitFor(() => expect(registerNameWithUsdCredits).toHaveBeenCalled())
      act(() => advance())

      expect(screen.getByText(/confirm to continue/i)).toBeTruthy()
    })

    // A managed wallet signs without a prompt, so "confirm" would point at a dialog that never opens.
    it('should not ask a managed-wallet buyer to confirm anything', async () => {
      session.providerType = 'magic'
      const advance = renderAtStage('awaiting-confirmation')

      await waitFor(() => expect(registerNameWithUsdCredits).toHaveBeenCalled())
      act(() => advance())

      expect(screen.queryByText(/confirm to continue/i)).toBeNull()
      expect(screen.getByText(/completing transaction/i)).toBeTruthy()
    })

    it('should stop asking for confirmation once the transaction is submitted', async () => {
      session.providerType = 'injected'
      const advance = renderAtStage('confirming')

      await waitFor(() => expect(registerNameWithUsdCredits).toHaveBeenCalled())
      act(() => advance())

      expect(screen.getByText(/completing transaction/i)).toBeTruthy()
      expect(screen.queryByText(/confirm to continue/i)).toBeNull()
    })

    /**
     * The long stretch, and the one the buyer waits through. It used to run under "Completing
     * transaction…" with the minutes-long wait explained only in the note below, which put the headline
     * and the truth in opposite places: the panel announced an ending while its longest phase was still
     * running. The step name now says what is happening and the note keeps the duration.
     */
    it('should name the minting as the step, not report the transaction as completing', async () => {
      const advance = renderAtStage('registering')

      await waitFor(() => expect(registerNameWithUsdCredits).toHaveBeenCalled())
      act(() => advance())

      expect(screen.getByText(/registering your NAME…/i)).toBeTruthy()
      expect(screen.getByText(/few minutes/i)).toBeTruthy()
      expect(screen.queryByText(/completing transaction/i)).toBeNull()
      expect(screen.queryByText(/confirm to continue/i)).toBeNull()
    })

    /**
     * The counter, which is what makes the wait legible as progress rather than as a hang.
     *
     * A managed wallet has nothing to answer, so registering the NAME is the whole purchase: one step, as
     * the design draws it. Promoting our own internal phases (`preparing`, `confirming`) into steps would
     * inflate that number with work the buyer cannot act on.
     */
    it('should count a managed-wallet purchase as the single step it is', async () => {
      session.providerType = 'magic'
      const advance = renderAtStage('preparing')

      await waitFor(() => expect(registerNameWithUsdCredits).toHaveBeenCalled())
      act(() => advance())
      expect(screen.getByTestId('name-progress-count').textContent).toBe('1/1')

      act(() => advance())
      expect(screen.getByTestId('name-progress-count').textContent).toBe('1/1')
    })

    it('should count the wallet prompt as a self-custody buyer own first step', async () => {
      session.providerType = 'injected'
      const advance = renderAtStage('awaiting-confirmation')

      await waitFor(() => expect(registerNameWithUsdCredits).toHaveBeenCalled())
      act(() => advance())

      expect(screen.getByTestId('name-progress-count').textContent).toBe('1/2')
    })

    it.each(['confirming', 'registering'])(
      'should move a self-custody buyer onto the last step at %s, once there is nothing left for them to do',
      async stage => {
        session.providerType = 'injected'
        const advance = renderAtStage(stage)

        await waitFor(() => expect(registerNameWithUsdCredits).toHaveBeenCalled())
        act(() => advance())

        expect(screen.getByTestId('name-progress-count').textContent).toBe('2/2')
      }
    )
  })

  describe('and the bridge has not landed yet', () => {
    /**
     * The regression this file exists for. `pending` used to fall through to the success screen, which tells
     * the buyer to find the NAME in My Items — for a NAME that may not be minted for minutes, or at all if
     * the destination actions revert. The money is gone either way, so this is reassurance, not an error.
     */
    it('should show the in-progress screen, not purchase-complete', async () => {
      registerNameWithUsdCredits.mockResolvedValue({ status: 'pending', originTxHash: '0xorigin' })
      renderModal()
      reenter()

      fireEvent.click(buyButton())

      await waitFor(() => expect(screen.getByText(/in progress/i)).toBeTruthy())
      expect(screen.queryByText(/purchase complete/i)).toBeNull()
      // It must not claim the NAME is already there.
      expect(screen.queryByText(/successful/i)).toBeNull()
      // And it must not offer to put a NAME they do not hold yet on their avatar.
      expect(screen.queryByText(/assign to avatar/i)).toBeNull()
    })

    it('should still report the purchase, tagged with how it settled', async () => {
      registerNameWithUsdCredits.mockResolvedValue({ status: 'pending', originTxHash: '0xorigin' })
      renderModal()
      reenter()

      fireEvent.click(buyButton())

      // The balance was charged, so this IS a completed purchase for analytics — but the settlement has to
      // be distinguishable, or pending and registered are indistinguishable in the funnel.
      await waitFor(() => expect(track).toHaveBeenCalled())
      const [event, props] = track.mock.calls.find(c => c[0] === 'Shop Completed Purchase') as [
        string,
        Record<string, unknown>
      ]
      expect(event).toBe('Shop Completed Purchase')
      expect(props).toMatchObject({ purchase_type: 'name', settlement: 'pending' })
    })

    it('should report a NAME with the same shape as any other purchase, so revenue cards see it', async () => {
      // A NAME used to omit value_usd, items[] and transaction_hash, so every USD-summing card counted it
      // as zero and every item-level card dropped it entirely.
      registerNameWithUsdCredits.mockResolvedValue({ status: 'pending', originTxHash: '0xorigin' })
      renderModal()
      reenter()

      fireEvent.click(buyButton())

      await waitFor(() => expect(track).toHaveBeenCalled())
      const [, props] = track.mock.calls.find(c => c[0] === 'Shop Completed Purchase') as [
        string,
        Record<string, unknown>
      ]
      expect(props.value_usd).toBeGreaterThan(0)
      expect(props.transaction_hash).toBeTruthy()
      expect(props.items).toMatchObject([{ category: 'name' }])
    })
  })

  describe('and the purchase cannot be sized or afforded', () => {
    it('should refuse to submit when there is no price, and say why', async () => {
      // No MANA/USD rate → the row shows "—" and nothing can compute the reservation. Submitting would read
      // the oracle again inside the lib and fail with a generic error after the click.
      renderModal(null)
      reenter()

      expect((buyButton() as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByTestId('name-blocked-reason').textContent).toMatch(/can't price|cannot price/i)
      fireEvent.click(buyButton())
      expect(registerNameWithUsdCredits).not.toHaveBeenCalled()
    })

    /**
     * Being short is no longer a refusal — it opens the top-up screen, which is the whole point of the
     * redesign. The confirm step (and its re-entry gate) is gone until the credits are there, so nothing
     * can be submitted from here either way.
     */
    it('should sell the missing credits instead of blocking, and say how short', () => {
      balance = { balanceCents: 200, credits: 20 }
      creditPacks.packs = [{ id: 'pack_100', credits: 100, usd: 11.99 }]
      renderModal(67)

      // 67 - 20 = 47 credits missing. Naming the gap is the difference between a dead end and a next step.
      expect(screen.getByText(/47 Credits/i)).toBeTruthy()
      expect(screen.getByTestId('credit-packs')).toBeTruthy()
      expect(screen.queryByLabelText(/re-?enter|confirm/i)).toBeNull()
      expect(registerNameWithUsdCredits).not.toHaveBeenCalled()
    })

    it('should NOT block when the balance is merely unknown', async () => {
      // useBalance yields undefined while loading and on error. Refusing a purchase because OUR read failed
      // is worse than letting the server be the authority — it would strand a buyer who can in fact pay.
      balance = undefined
      registerNameWithUsdCredits.mockResolvedValue({
        status: 'registered',
        originTxHash: '0x1',
        destinationTxHash: null
      })
      renderModal(67)
      reenter()

      expect((buyButton() as HTMLButtonElement).disabled).toBe(false)
      fireEvent.click(buyButton())
      await waitFor(() => expect(registerNameWithUsdCredits).toHaveBeenCalledTimes(1))
    })

    it('should keep the CTA disabled until the re-typed name matches', () => {
      renderModal(67)

      expect((buyButton() as HTMLButtonElement).disabled).toBe(true)
      reenter('hodo')
      expect((buyButton() as HTMLButtonElement).disabled).toBe(true)
      reenter('hodor')
      expect((buyButton() as HTMLButtonElement).disabled).toBe(false)
    })
  })

  /**
   * The credit is already spent and the NAME was not minted. This is the one failure where the retry button
   * is actively harmful: pressing it buys a second credit for something the buyer cannot fix, and the
   * generic copy ("please try again") is exactly that instruction.
   */
  describe('and the credit was consumed without the name being registered', () => {
    beforeEach(() => {
      registerNameWithUsdCredits.mockRejectedValue(new NameNotRegisteredError())
    })

    it('should say the funds were returned rather than show the generic failure', async () => {
      renderModal(67)
      reenter()

      fireEvent.click(buyButton())

      await waitFor(() => expect(screen.getByText(/funds were returned/i)).toBeTruthy())
      expect(screen.queryByText(/RAW_NOT_REGISTERED_INTERNAL/)).toBeNull()
      expect(screen.queryByText(/couldn’t complete your purchase|couldn't complete your purchase/i)).toBeNull()
    })

    it('should not offer a retry button', async () => {
      renderModal(67)
      reenter()

      fireEvent.click(buyButton())

      await waitFor(() => expect(screen.getByText(/funds were returned/i)).toBeTruthy())
      expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
      // Its own label rather than a second "Close": the header X already carries that name, and two
      // identically-named buttons are indistinguishable to anyone navigating by role.
      expect(screen.getByRole('button', { name: /got it/i })).toBeTruthy()
    })
  })

  /**
   * The relayer gave no usable response, so whether the credit was spent is unknown. Retrying is the one
   * action that can genuinely double-spend: the first attempt may still be in flight, so the name reads as
   * free, the route re-fetch succeeds, and a second credit is authorized against a registration that lands.
   */
  describe('and the settlement could not be confirmed', () => {
    beforeEach(() => {
      registerNameWithUsdCredits.mockRejectedValue(new NameSettlementUnknownError())
    })

    it('should say it could not be confirmed rather than show the generic failure', async () => {
      renderModal(67)
      reenter()

      fireEvent.click(buyButton())

      await waitFor(() => expect(screen.getByText(/couldn’t confirm|couldn't confirm/i)).toBeTruthy())
      expect(screen.queryByText(/RAW_UNKNOWN_INTERNAL/)).toBeNull()
      expect(screen.queryByText(/couldn’t complete your purchase|couldn't complete your purchase/i)).toBeNull()
    })

    it('should not offer a retry button', async () => {
      renderModal(67)
      reenter()

      fireEvent.click(buyButton())

      await waitFor(() => expect(screen.getByText(/couldn’t confirm|couldn't confirm/i)).toBeTruthy())
      expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
      expect(screen.getByRole('button', { name: /got it/i })).toBeTruthy()
    })
  })

  describe('and the route is withheld for cost', () => {
    /**
     * ROUTE_COST_TOO_HIGH is a temporary, network-wide condition with nothing wrong on the buyer's side —
     * so "please try again" (the generic copy) is actively misleading advice. The lib types it separately
     * and rethrows it unwrapped precisely so this screen can say "later".
     */
    it('should explain that it is temporary rather than show the generic failure', async () => {
      registerNameWithUsdCredits.mockRejectedValue(new NameRouteCostTooHighError())
      renderModal(67)
      reenter()

      fireEvent.click(buyButton())

      await waitFor(() => expect(screen.getByText(/try again later/i)).toBeTruthy())
      // The dedicated copy, not the raw error and not the generic "please try again".
      expect(screen.queryByText(/RAW_ROUTE_COST_INTERNAL/)).toBeNull()
      expect(screen.queryByText(/couldn’t complete your purchase|couldn't complete your purchase/i)).toBeNull()
      // …and it explains the temporariness without naming the cause. Every buyer reaches this screen,
      // including one who has never heard of a network fee, and neither kind can act on the number that
      // caused it — the only actionable part is "later".
      expect(screen.queryByText(/network|gas|bridge/i)).toBeNull()
    })

    it('should show the failure message for any other error', async () => {
      registerNameWithUsdCredits.mockRejectedValue(new Error('Boom from the lib'))
      renderModal(67)
      reenter()

      fireEvent.click(buyButton())

      await waitFor(() => expect(screen.getByText('Boom from the lib')).toBeTruthy())
    })
  })

  /**
   * Choosing HOW to pay, before the NAME is confirmed.
   *
   * A NAME costs a fixed 100 MANA, so a buyer holding MANA can cover part (Polygon, mixed with credits) or
   * all of it (Ethereum, spending no credits at all). The question is only asked when there is something to
   * choose — a credits-only buyer goes straight to the re-entry gate, as before.
   */
  describe('and the buyer holds MANA of their own', () => {
    const MANA_L1 = (n: number) => BigInt(n) * 10n ** 18n

    // Settles on its own chain and spends no credits, so it can never be ticked alongside the others.
    it('should let the Ethereum rail take the selection over, and give it back', () => {
      session.providerType = 'injected'
      balance = { balanceCents: 300, credits: 30 }
      manaBalances.data = { matic: MANA_L1(500), ethereum: MANA_L1(500) }
      renderModal(67)

      const alt = screen.getByTestId('pay-with-alt')
      fireEvent.click(alt)
      expect(alt.getAttribute('data-selected')).toBe('true')
      expect(screen.getByTestId('pay-with-credits').getAttribute('data-selected')).not.toBe('true')

      fireEvent.click(screen.getByTestId('pay-with-credits'))
      expect(alt.getAttribute('data-selected')).not.toBe('true')
    })

    /**
     * A managed wallet cannot pay for an Ethereum transaction, so the row is absent rather than disabled:
     * there is nothing its owner could do to make it work.
     */
    it('should not offer the Ethereum rail to a wallet that cannot pay its own gas', () => {
      session.providerType = 'magic'
      manaBalances.data = { matic: 0n, ethereum: MANA_L1(500) }
      renderModal(67)

      expect(screen.queryByTestId('pay-with-alt')).toBeNull()
    })

    // Held L1 MANA that cannot pay: the balance is on screen, so a row that vanished would read as a bug.
    it('should show the Ethereum rail disabled when the balance falls short', () => {
      session.providerType = 'injected'
      balance = { balanceCents: 300, credits: 30 }
      manaBalances.data = { matic: MANA_L1(500), ethereum: MANA_L1(40) }
      renderModal(67)

      expect(screen.getByTestId<HTMLButtonElement>('pay-with-alt').disabled).toBe(true)
    })

    it('should register on Ethereum, spending no credits, once that rail is confirmed', async () => {
      session.providerType = 'injected'
      manaBalances.data = { matic: 0n, ethereum: MANA_L1(500) }
      registerNameWithEthereumMana.mockResolvedValue({ status: 'registered', originTxHash: '0xl1' })
      renderModal(67)

      fireEvent.click(screen.getByTestId('pay-with-alt'))
      fireEvent.click(screen.getByTestId('confirm-payment'))
      // The NAME still has to be re-typed: choosing how to pay is not confirming what is bought.
      reenter()
      fireEvent.click(buyButton())

      await waitFor(() => expect(registerNameWithEthereumMana).toHaveBeenCalledTimes(1))
      expect(registerNameWithUsdCredits).not.toHaveBeenCalled()
    })

    // Zero credits leave the balance on this rail, so booking the price would report the buyer's own MANA
    // as credit revenue.
    it('should report the Ethereum rail as spending no credits', async () => {
      session.providerType = 'injected'
      manaBalances.data = { matic: 0n, ethereum: MANA_L1(500) }
      registerNameWithEthereumMana.mockResolvedValue({ status: 'registered', originTxHash: '0xl1' })
      renderModal(67)

      fireEvent.click(screen.getByTestId('pay-with-alt'))
      fireEvent.click(screen.getByTestId('confirm-payment'))
      reenter()
      fireEvent.click(buyButton())

      await waitFor(() => expect(track.mock.calls.some(c => c[0] === 'Shop Completed Purchase')).toBe(true))
      const done = track.mock.calls.find(c => c[0] === 'Shop Completed Purchase')![1] as Record<string, unknown>
      expect(done.payment_type).toBe('ethereum_mana')
      expect(done.value_credits).toBe(0)
      expect(done.value_usd).toBe(0)
    })

    /**
     * A wallet on the wrong chain is not a failed purchase — nothing was signed or spent — so it gets a
     * screen with the one control that fixes it rather than the error panel and its retry button.
     */
    it('should offer to switch the network instead of failing', async () => {
      session.providerType = 'injected'
      manaBalances.data = { matic: 0n, ethereum: MANA_L1(500) }
      // The REAL error class, not a hand-made object with the right `name`: `isWrongNetworkError` checks
      // `instanceof`, and a fabricated stand-in passes a check production cannot — which is how the wrapped
      // error that made this screen unreachable got past the suite in the first place.
      registerNameWithEthereumMana.mockRejectedValue(new WrongNetworkError(137, 1))
      renderModal(67)

      fireEvent.click(screen.getByTestId('pay-with-alt'))
      fireEvent.click(screen.getByTestId('confirm-payment'))
      reenter()
      fireEvent.click(buyButton())

      await waitFor(() => expect(screen.getByTestId('name-switch-chain')).toBeTruthy())
      expect(screen.getByTestId('name-switch-chain-cta')).toBeTruthy()
      // Not the failure screen: there is nothing to retry until the network changes.
      expect(screen.queryByText(/couldn.t complete your purchase/i)).toBeNull()
    })

    const MANA = (n: number) => BigInt(n) * 10n ** 18n

    it('should not ask anything of a buyer whose only rail is credits', () => {
      renderModal(67)

      expect(screen.queryByTestId('pay-with-credits')).toBeNull()
      expect(screen.getByLabelText(/re-?enter|confirm/i)).toBeTruthy()
    })

    it('should offer the mixed rail when Polygon MANA can cover what credits cannot', () => {
      balance = { balanceCents: 300, credits: 30 }
      manaBalances.data = { matic: MANA(500), ethereum: 0n }
      renderModal(67)

      expect(screen.getByTestId('pay-with-credits')).toBeTruthy()
      expect(screen.getByTestId('pay-with-mana')).toBeTruthy()
      // Nothing to pay the whole thing on L1 with, so no third row at all.
      expect(screen.queryByTestId('pay-with-alt')).toBeNull()
    })

    /**
     * Short on credits but holding MANA is NOT being stuck, so the pack picker — which exists for a buyer
     * with no way to pay — must give way to the choice they actually have.
     */
    it('should offer the rails instead of selling credit packs to a buyer who holds MANA', () => {
      balance = { balanceCents: 300, credits: 30 }
      manaBalances.data = { matic: MANA(500), ethereum: 0n }
      creditPacks.packs = [{ id: 'p100', credits: 100, usd: 11.99 }]
      renderModal(67)

      expect(screen.queryByTestId('credit-packs')).toBeNull()
      expect(screen.getByTestId('pay-with-mana')).toBeTruthy()
    })

    it('should reserve only the credits leg when the mixed rail is confirmed', async () => {
      balance = { balanceCents: 300, credits: 30 }
      manaBalances.data = { matic: MANA(500), ethereum: 0n }
      registerNameWithUsdCredits.mockResolvedValue({ status: 'registered', originTxHash: '0x1' })
      renderModal(67)

      fireEvent.click(screen.getByTestId('confirm-payment'))
      reenter()
      fireEvent.click(buyButton())

      await waitFor(() => expect(registerNameWithUsdCredits).toHaveBeenCalledTimes(1))
      // 30 credits floored to whole credits = 300 cents; the rest rides on MANA.
      expect(registerNameWithUsdCredits.mock.calls[0][0].creditsCents).toBe(300)
    })
  })

  /**
   * The no-funds screen (Figma 2996-434120).
   *
   * What it replaces is the point: a named shortfall above a disabled BUY NAME, which told the buyer what
   * was wrong and left them to find the credits page themselves. Here the modal sells them the credits,
   * sends them to Stripe, and the credits page routes them back to this same NAME.
   */
  describe('and the buyer cannot afford the NAME yet', () => {
    beforeEach(() => {
      // 67 - 20 = 47 short. 40 cannot close that; 100, 260 and 540 can.
      balance = { balanceCents: 200, credits: 20 }
      creditPacks.packs = [
        { id: 'pack_40', credits: 40, usd: 5.99 },
        { id: 'pack_100', credits: 100, usd: 11.99 },
        { id: 'pack_260', credits: 260, usd: 29.99 },
        { id: 'pack_540', credits: 540, usd: 59.99 }
      ]
    })

    afterEach(() => {
      creditPacks.packs = []
    })

    /**
     * Every pack here is a promise that buying it finishes the NAME. A pack smaller than the gap breaks
     * that promise — the buyer pays and lands back on this same screen, still short.
     */
    it('should offer only the packs that close the gap', () => {
      renderModal(67)

      const packs = screen.getByTestId('credit-packs')
      expect(within(packs).queryByText('40')).toBeNull()
      expect(within(packs).getByText('100')).toBeTruthy()
      expect(within(packs).getByText('260')).toBeTruthy()
      expect(within(packs).getByText('540')).toBeTruthy()
    })

    // The cheapest way to the NAME they came for, not the one we would rather sell.
    it('should recommend the smallest pack that closes the gap, and total it', () => {
      renderModal(67)

      const recommended = screen.getByTestId('pack-recommended').closest('button')
      expect(recommended).not.toBeNull()
      expect(within(recommended as HTMLElement).getByText('100')).toBeTruthy()
      expect(screen.getByTestId('topup-total-credits').textContent).toBe('100')
    })

    it('should keep every pack on offer when none of them is enough', () => {
      // A NAME dearer than the largest pack: an empty picker would be worse than an honest one, and the
      // largest is then the most progress on offer.
      creditPacks.packs = [{ id: 'pack_40', credits: 40, usd: 5.99 }]
      renderModal(67)

      expect(within(screen.getByTestId('credit-packs')).getByText('40')).toBeTruthy()
      expect(screen.getByTestId('topup-total-credits').textContent).toBe('40')
    })

    it('should follow the buyer when they pick a different pack', () => {
      renderModal(67)

      fireEvent.click(within(screen.getByTestId('credit-packs')).getByText('260').closest('button') as HTMLElement)

      expect(screen.getByTestId('topup-total-credits').textContent).toBe('260')
    })

    it('should stash the NAME and start the checkout for the chosen pack', async () => {
      createPackCheckout.mockResolvedValue({ orderId: 'order-1', mock: true })
      renderModal(67)

      fireEvent.click(screen.getByTestId('name-buy-credits'))

      await waitFor(() => expect(createPackCheckout).toHaveBeenCalledTimes(1))
      expect(createPackCheckout.mock.calls[0][0]).toBe('pack_100')
      // The NAME, never its price: a NAME is priced from the MANA/USD oracle, so the figure that was on
      // screen is stale by the time the buyer returns. The credits page reads this to route them back.
      expect(sessionStorage.getItem(RESUME_NAME_KEY)).toBe('hodor')
      // No hosted URL (mock payments, Stripe off): the credits page grants, then resumes.
      await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/credits'))
    })

    it('should drop the stash and explain when the checkout cannot be started', async () => {
      createPackCheckout.mockRejectedValue(new Error('RAW_STRIPE_INTERNAL'))
      renderModal(67)

      fireEvent.click(screen.getByTestId('name-buy-credits'))

      await waitFor(() => expect(screen.getByText(/couldn.t start the credits checkout/i)).toBeTruthy())
      // Nothing was charged and nothing reserved, so a stash left behind would bounce an unrelated top-up
      // to this NAME later.
      expect(sessionStorage.getItem(RESUME_NAME_KEY)).toBeNull()
      expect(captureError).toHaveBeenCalled()
      expect(screen.queryByText(/RAW_STRIPE_INTERNAL/)).toBeNull()
    })

    // A checkout with neither a redirect url nor an order id has nothing to hand over; navigating anyway
    // would send the buyer to a page polling `order=undefined` and reporting a failure over a live payment.
    it('should refuse a checkout that returns no redirect and no order id', async () => {
      createPackCheckout.mockResolvedValue({ mock: true })
      renderModal(67)

      fireEvent.click(screen.getByTestId('name-buy-credits'))

      await waitFor(() => expect(screen.getByText(/couldn.t start the credits checkout/i)).toBeTruthy())
      expect(sessionStorage.getItem(RESUME_NAME_KEY)).toBeNull()
      expect(screen.getByTestId('location').textContent).not.toMatch(/credits/)
    })

    /**
     * The return trip. The screen follows the BALANCE rather than a decision taken when the modal opened,
     * so a buyer back from Stripe with the money landed gets the confirm step — with the re-entry field
     * empty, because they still have not confirmed the NAME. That gate is the point of the step.
     */
    it('should land on the confirm step with an empty re-entry once the credits arrive', () => {
      balance = { balanceCents: 6700, credits: 67 }
      renderModal(67)

      expect(screen.queryByTestId('credit-packs')).toBeNull()
      expect(screen.getByLabelText<HTMLInputElement>(/re-?enter|confirm/i).value).toBe('')
      expect((buyButton() as HTMLButtonElement).disabled).toBe(true)
      reenter()
      expect((buyButton() as HTMLButtonElement).disabled).toBe(false)
    })

    /**
     * The three resume hand-offs are ONE intent, and the credits page claims them cart-first.
     *
     * A cart or item hand-off left behind by an earlier abandoned top-up would therefore outrank this one —
     * and both of those resume by CHARGING without asking again. The credits bought for this NAME would be
     * spent on a basket the buyer had already walked away from, and the NAME never bought at all.
     */
    it('should take over a stale cart or item hand-off rather than queue behind it', async () => {
      sessionStorage.setItem(RESUME_CART_KEY, JSON.stringify([{ id: 'abandoned' }]))
      sessionStorage.setItem(RESUME_BUY_KEY, JSON.stringify({ id: 'abandoned' }))
      createPackCheckout.mockResolvedValue({ orderId: 'order-1', mock: true })
      renderModal(67)

      fireEvent.click(screen.getByTestId('name-buy-credits'))

      await waitFor(() => expect(createPackCheckout).toHaveBeenCalledTimes(1))
      expect(sessionStorage.getItem(RESUME_NAME_KEY)).toBe('hodor')
      expect(sessionStorage.getItem(RESUME_CART_KEY)).toBeNull()
      expect(sessionStorage.getItem(RESUME_BUY_KEY)).toBeNull()
    })

    /**
     * Leaving for the hosted checkout and coming back with the browser's own back button.
     *
     * The busy flag is deliberately never released once the redirect is under way — releasing it there
     * re-enables BUY for the moment before the browser leaves, and a second click opens a second Checkout
     * Session. But a bfcache restore brings the component back with its state intact, so the modal
     * reappeared with every way out disabled: the ✕, CANCEL and BUY all read the same flag.
     */
    it('should come back usable when the browser restores the page', async () => {
      // Never settles: the redirect is under way and the flag stays set, as it does in production.
      createPackCheckout.mockReturnValue(new Promise(() => {}))
      renderModal(67)

      fireEvent.click(screen.getByTestId('name-buy-credits'))
      await waitFor(() => expect(createPackCheckout).toHaveBeenCalledTimes(1))
      expect(screen.getByTestId<HTMLButtonElement>('name-buy-credits').disabled).toBe(true)

      // The bfcache restore, which is exactly what `persisted` distinguishes from a fresh load.
      act(() => {
        const e = new Event('pageshow') as Event & { persisted: boolean }
        Object.defineProperty(e, 'persisted', { value: true })
        window.dispatchEvent(e)
      })

      expect(screen.getByTestId<HTMLButtonElement>('name-buy-credits').disabled).toBe(false)
      expect(screen.getByTestId<HTMLButtonElement>('name-topup-cancel').disabled).toBe(false)
      expect(screen.getByRole('button', { name: /close/i })).toBeEnabled()
    })

    // Closing does not cancel the checkout already in flight, so it must not be offered: the request
    // resolves a moment later and throws the buyer out to Stripe regardless.
    it('should refuse to be dismissed while the checkout is in flight', async () => {
      const onClose = vi.fn()
      createPackCheckout.mockReturnValue(new Promise(() => {})) // never settles
      renderModal(67, onClose)

      fireEvent.click(screen.getByTestId('name-buy-credits'))

      await waitFor(() => expect(createPackCheckout).toHaveBeenCalledTimes(1))
      // Every way out, not just the ✕: CANCEL is the one a buyer on this screen actually reaches for, and
      // it was the one left ungated.
      fireEvent.click(screen.getByRole('button', { name: /close/i }))
      fireEvent.keyDown(document, { key: 'Escape' })
      fireEvent.click(screen.getByTestId('name-topup-cancel'))
      expect(onClose).not.toHaveBeenCalled()
      // …and BUY stays held down, so a second click cannot open a second Checkout Session.
      fireEvent.click(screen.getByTestId('name-buy-credits'))
      expect(createPackCheckout).toHaveBeenCalledTimes(1)
    })

    /**
     * The badge claims "this pack finishes your NAME". In the fallback branch nothing does, so it must not
     * be made — otherwise the buyer pays and lands back on this exact screen, which is the failure the
     * covering filter exists to prevent.
     */
    it('should not badge a recommendation when no pack can close the gap', () => {
      creditPacks.packs = [{ id: 'pack_40', credits: 40, usd: 5.99 }]
      renderModal(670)

      expect(within(screen.getByTestId('credit-packs')).getByText('40')).toBeTruthy()
      expect(screen.queryByTestId('pack-recommended')).toBeNull()
      // Still preselected and buyable — it is the most progress on offer, just not the answer.
      expect(screen.getByTestId('topup-total-credits').textContent).toBe('40')
      expect(screen.getByTestId<HTMLButtonElement>('name-buy-credits').disabled).toBe(false)
    })

    // The iOS web view cannot sell credits, so this screen has nothing but the shortfall — it has to keep
    // naming the NAME and its price, or it is a worse dead end than the one it replaced.
    it('should still name the NAME and its price inside the iOS web view', () => {
      iap.on = true
      renderModal(67)

      expect(screen.getByTestId('name-row-iap')).toBeTruthy()
      expect(screen.getByText(/hodor/)).toBeTruthy()
    })

    // Credits are sold through In-App Purchase inside the iOS web view, so the sale itself cannot render.
    // The shortfall still has to be stated, or the buyer is left with a NAME and no explanation.
    it('should not sell credits inside the iOS web view', () => {
      iap.on = true
      renderModal(67)

      expect(screen.getByText(/47 Credits/i)).toBeTruthy()
      expect(screen.queryByTestId('credit-packs')).toBeNull()
      expect(screen.queryByTestId('name-buy-credits')).toBeNull()
    })
  })
})
