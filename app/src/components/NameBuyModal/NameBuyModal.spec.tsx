import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  class NameNotRegisteredError extends Error {
    constructor() {
      // Raw wording again, so the assertions below cannot pass by echoing the error's own message.
      super('RAW_NOT_REGISTERED_INTERNAL')
      this.name = 'NameNotRegisteredError'
    }
  }
  return {
    NameRouteCostTooHighError,
    NameNotRegisteredError,
    NameSettlementUnknownError,
    registerNameWithUsdCredits: (...a: unknown[]) => registerNameWithUsdCredits(...a)
  }
})

const track = vi.fn()
vi.mock('~/lib/analytics', () => ({
  track: (...a: unknown[]) => track(...a),
  errorCode: () => 'x',
  isUserRejection: () => false
}))

// Mirrors the REAL shape: useBalance resolves a `UsdBalance` object, not a number. Mocking it as a bare
// number let an earlier version of the gate compile against the wrong type and still pass here — the spec
// has to speak the same language as production or it certifies nothing.
let balance: { balanceCents: number; credits: number } | undefined = { balanceCents: 5000, credits: 500 }
vi.mock('~/hooks/useBalance', () => ({
  useBalance: () => ({ data: balance, isError: false }),
  balanceLabel: (b?: { credits: number }) => (b == null ? '—' : String(b.credits))
}))

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

function renderModal(priceCredits: number | null = 67) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NameBuyModal name="hodor" priceCredits={priceCredits} onClose={vi.fn()} />
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
    track.mockReset()
    balance = { balanceCents: 5000, credits: 500 }
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

    it('should refuse to submit when the balance is short, and say how short', async () => {
      balance = { balanceCents: 200, credits: 20 }
      renderModal(67)
      reenter()

      expect((buyButton() as HTMLButtonElement).disabled).toBe(true)
      // 67 - 20 = 47 credits missing. Naming the gap is the difference between a dead end and a next step.
      expect(screen.getByTestId('name-blocked-reason').textContent).toMatch(/47/)
      fireEvent.click(buyButton())
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
})
