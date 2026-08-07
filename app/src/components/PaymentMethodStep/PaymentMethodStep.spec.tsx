import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PaymentMethodStep } from './PaymentMethodStep'
import { computePaymentOptions } from '~/lib/payment-options'
import type { CatalogItem } from '~/lib/api'

// CreatorName resolves a profile over the network — irrelevant here, so stub it.
vi.mock('~/components/CreatorName', () => ({ CreatorName: () => <span>creator</span> }))

const item = {
  name: 'Galaxy Hat',
  creator: '0xcreator',
  thumbnail: '',
  contractAddress: '0xabc',
  itemId: '1'
} as unknown as CatalogItem

// A 100-credit (1000-cent) item that costs 500 MANA.
const PRICE_CENTS = 1000
const PRICE_MANA = 500n * 10n ** 18n
const mana = (n: number) => BigInt(n) * 10n ** 18n

function setup(over: { balanceCents?: number; manaBalanceWei?: bigint; priceManaWei?: bigint }) {
  const balanceCents = over.balanceCents ?? 0
  const manaBalanceWei = over.manaBalanceWei ?? 0n
  const priceManaWei = over.priceManaWei ?? PRICE_MANA
  const computed = computePaymentOptions({ priceCents: PRICE_CENTS, priceManaWei, balanceCents, manaBalanceWei })
  const onBuy = vi.fn()
  render(
    <PaymentMethodStep
      item={item}
      priceCredits={100}
      priceCents={PRICE_CENTS}
      options={computed.options}
      priceManaWei={priceManaWei}
      balanceCredits={balanceCents / 10}
      manaBalanceWei={manaBalanceWei}
      onBuy={onBuy}
      onClose={vi.fn()}
    />
  )
  return { onBuy }
}

const row = (rail: 'credits' | 'mana') => screen.getByTestId(`pay-with-${rail}`)
const confirm = () => screen.getByTestId<HTMLButtonElement>('confirm-payment')
const isOn = (rail: 'credits' | 'mana') => row(rail).getAttribute('data-selected') === 'true'

// The design (node 1654-371913) is two CHECKBOX rows plus one BUY, not one button per rail: ticking both
// rows is how a mixed credits + MANA payment is expressed.
describe('PaymentMethodStep', () => {
  describe('the rows', () => {
    it('should always render both rails, so a balance on screen never lacks a row', () => {
      setup({ balanceCents: 0, manaBalanceWei: 0n })
      expect(row('credits')).toBeTruthy()
      expect(row('mana')).toBeTruthy()
    })

    it('should preselect credits when they cover the price on their own', () => {
      setup({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA })
      expect(isOn('credits')).toBe(true)
      expect(isOn('mana')).toBe(false)
    })

    it('should preselect BOTH rails when neither covers the price alone', () => {
      // 400 cents of credits + 400 MANA: covers the 300-MANA remainder, not the 500-MANA full price.
      setup({ balanceCents: 400, manaBalanceWei: mana(400) })
      expect(isOn('credits')).toBe(true)
      expect(isOn('mana')).toBe(true)
    })

    it('should preselect MANA alone when the buyer holds no credits', () => {
      setup({ balanceCents: 0, manaBalanceWei: PRICE_MANA })
      expect(isOn('credits')).toBe(false)
      expect(isOn('mana')).toBe(true)
    })

    it('should disable a rail that cannot pay, on its own or mixed', () => {
      // No MANA at all: the row stays (the design keeps it) but cannot be ticked.
      setup({ balanceCents: PRICE_CENTS, manaBalanceWei: 0n })
      expect((row('mana') as HTMLButtonElement).disabled).toBe(true)
      expect((row('credits') as HTMLButtonElement).disabled).toBe(false)
    })
  })

  describe('what each row charges', () => {
    it('should show the full price on a single-rail selection', () => {
      setup({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA })
      expect(row('credits').textContent).toContain('100')
      expect(row('mana').textContent).toContain('500')
    })

    it('should show each LEG when both rails are ticked, not the full price twice', () => {
      // 400 cents of credits (= 40 credits) + the 300-MANA remainder.
      setup({ balanceCents: 400, manaBalanceWei: mana(400) })
      expect(row('credits').textContent).toContain('40')
      expect(row('mana').textContent).toContain('300')
    })

    it('should show each balance so the buyer sees what they are spending from', () => {
      setup({ balanceCents: 400, manaBalanceWei: mana(400) })
      expect(row('credits').textContent).toMatch(/credits balance/i)
      expect(row('mana').textContent).toMatch(/mana balance/i)
      expect(row('mana').textContent).toContain('400')
    })
  })

  describe('confirming', () => {
    it('should buy with credits when only that row is ticked', () => {
      const { onBuy } = setup({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA })
      fireEvent.click(confirm())
      expect(onBuy).toHaveBeenCalledWith('credits')
    })

    it('should buy with MANA when only that row is ticked', () => {
      const { onBuy } = setup({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA })
      fireEvent.click(row('credits')) // untick credits
      fireEvent.click(row('mana')) // tick MANA
      fireEvent.click(confirm())
      expect(onBuy).toHaveBeenCalledWith('mana')
    })

    it('should buy with the mixed rail when both rows are ticked', () => {
      const { onBuy } = setup({ balanceCents: 400, manaBalanceWei: mana(400) })
      fireEvent.click(confirm())
      expect(onBuy).toHaveBeenCalledWith('combined')
    })

    it('should stay disabled while nothing is ticked, so nothing unpayable can be submitted', () => {
      const { onBuy } = setup({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA })
      fireEvent.click(row('credits')) // nothing ticked now
      expect(confirm().disabled).toBe(true)
      fireEvent.click(confirm())
      expect(onBuy).not.toHaveBeenCalled()
    })

    it('should refuse a tick on a rail that cannot pay', () => {
      // Credits cover the price alone, but there is no MANA — so credits + MANA is not a rail, and the
      // MANA row must not become selectable just because the credits one is.
      const { onBuy } = setup({ balanceCents: PRICE_CENTS, manaBalanceWei: 0n })
      fireEvent.click(row('mana'))
      expect(isOn('mana')).toBe(false)
      fireEvent.click(confirm())
      expect(onBuy).toHaveBeenCalledWith('credits')
    })
  })

  /**
   * The rate is never shown. MANA is oracle-priced and the oracle differs per network, so a quoted
   * "1 credit = N MANA" is a number the shop cannot stand behind between one read and the next — and a
   * buyer who reads it as a promise is being misled. What the buyer is charged is on the button; the rate
   * that produced it is not theirs to reconcile.
   */
  describe('the exchange rate', () => {
    it('should never quote a MANA-per-credit rate', () => {
      setup({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA })

      expect(screen.queryByTestId('mana-rate-note')).toBeNull()
      expect(document.body.textContent).not.toMatch(/1 credit =/i)
    })
  })

  describe('held MANA that cannot pay', () => {
    // The row still needs a reason — a silently unusable rail reads as a bug. The reason is the shortfall
    // itself, never what the balance converts to.
    it('should say the balance is short, without converting it to credits', () => {
      setup({ balanceCents: PRICE_CENTS, manaBalanceWei: mana(1) })

      expect(screen.getByTestId('mana-shortfall-note').textContent).toMatch(/not enough mana/i)
      expect(document.body.textContent).not.toMatch(/worth about/i)
    })
  })
})
