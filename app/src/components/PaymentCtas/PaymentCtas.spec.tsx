import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentCtas } from '~/components/PaymentCtas'
import { computePaymentOptions } from '~/lib/payment-options'

/**
 * This component owns the whole button area of a checkout, which is why the credits CTA has to be its
 * responsibility rather than the caller's: the cart used to decide between "render PaymentCtas" and "render a
 * plain checkout button" from the payable rails, and got it wrong for anyone holding a little MANA — the
 * shortfall routed into this component with zero options, so all it drew was a disabled MANA button and there
 * was no way forward at all.
 *
 * `computePaymentOptions` is the REAL one: what matters is the pairing between the rails a balance actually
 * funds and the buttons that come out, and a hand-built options array would assert nothing about that.
 */
const MANA = (whole: number) => BigInt(whole) * 10n ** 18n
// A 20-credit purchase ($2). At $0.50/MANA that is 4 MANA.
const PRICE_CENTS = 200
const PRICE_MANA = MANA(4)

function renderCtas(balanceCents: number, manaBalanceWei: bigint) {
  const rails = computePaymentOptions({
    priceCents: PRICE_CENTS,
    priceManaWei: PRICE_MANA,
    balanceCents,
    manaBalanceWei
  })
  const onPay = vi.fn()
  const onFallback = vi.fn()
  render(
    <PaymentCtas
      options={rails.options}
      shortfall={rails.manaShortfall}
      totalCents={PRICE_CENTS}
      onPay={onPay}
      creditsFallback={{ label: 'Checkout', onClick: onFallback }}
    />
  )
  return { onPay, onFallback, rails }
}

describe('when the credits balance covers the purchase', () => {
  it('should offer the payable credits rail and no fallback', () => {
    renderCtas(PRICE_CENTS, 0n)

    expect(screen.getByTestId('pay-with-credits')).toBeInTheDocument()
    expect(screen.queryByTestId('pay-with-credits-topup')).not.toBeInTheDocument()
  })
})

describe('when the credits balance falls short', () => {
  describe('and the wallet holds no MANA', () => {
    it('should offer the credits CTA as a way to top up', () => {
      renderCtas(100, 0n)

      expect(screen.getByTestId('pay-with-credits-topup')).toBeInTheDocument()
      expect(screen.queryByTestId('pay-with-credits')).not.toBeInTheDocument()
    })
  })

  describe('and the wallet holds MANA that cannot pay either', () => {
    it('should offer the credits CTA alongside the explained MANA button', () => {
      // The reported bug: 1 MANA against a 4-MANA price, with credits short too. Every rail is unpayable,
      // and this used to render the disabled MANA button as the ONLY control on screen.
      const { rails } = renderCtas(100, MANA(1))
      expect(rails.options).toHaveLength(0)
      expect(rails.manaShortfall).not.toBeNull()

      expect(screen.getByTestId('pay-with-credits-topup')).toBeInTheDocument()
      expect(screen.getByTestId('pay-with-mana-disabled')).toBeInTheDocument()
      expect(screen.getByTestId('mana-shortfall-note')).toBeInTheDocument()
    })
  })

  describe('and MANA covers only the remainder', () => {
    it('should offer the credits CTA alongside the combined rail', () => {
      // 2 MANA against a 4-MANA price, with 10 of the 20 credits held: neither pays alone, but together
      // they do — the `combined` rail. Listed in the PR's scenario table and previously unasserted.
      const { rails } = renderCtas(100, MANA(2))
      expect(rails.options.some(o => o.method === 'combined')).toBe(true)

      expect(screen.getByTestId('pay-with-combined')).toBeInTheDocument()
      expect(screen.getByTestId('pay-with-credits-topup')).toBeInTheDocument()
    })
  })

  describe('and MANA alone could pay the whole purchase', () => {
    it('should still offer the credits CTA, for a buyer who would rather keep their MANA', () => {
      const { rails } = renderCtas(100, MANA(50))
      expect(rails.options.some(o => o.method === 'mana')).toBe(true)

      expect(screen.getByTestId('pay-with-mana')).toBeInTheDocument()
      expect(screen.getByTestId('pay-with-credits-topup')).toBeInTheDocument()
    })
  })

  it('should route the credits CTA to the fallback, not to a charge', async () => {
    const user = userEvent.setup()
    const { onPay, onFallback } = renderCtas(100, 0n)

    await user.click(screen.getByTestId('pay-with-credits-topup'))

    // Never charges: there is nothing to charge against. It opens the flow that sells credits.
    expect(onFallback).toHaveBeenCalledTimes(1)
    expect(onPay).not.toHaveBeenCalled()
  })
})

describe('when no fallback is supplied', () => {
  it('should render nothing extra, so other callers are unaffected', () => {
    const rails = computePaymentOptions({
      priceCents: PRICE_CENTS,
      priceManaWei: PRICE_MANA,
      balanceCents: 100,
      manaBalanceWei: 0n
    })
    render(
      <PaymentCtas options={rails.options} shortfall={rails.manaShortfall} totalCents={PRICE_CENTS} onPay={vi.fn()} />
    )

    expect(screen.queryByTestId('pay-with-credits-topup')).not.toBeInTheDocument()
  })
})
