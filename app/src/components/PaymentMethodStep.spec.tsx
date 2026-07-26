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
      onBuy={onBuy}
      onClose={vi.fn()}
    />
  )
  return { onBuy }
}

const rows = () => ['credits', 'combined', 'mana'].filter(m => screen.queryByTestId(`pay-with-${m}`))

describe('PaymentMethodStep', () => {
  describe('which rows it renders', () => {
    it('should render credits and mana (no combined) when either balance covers the price on its own', () => {
      setup({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA })
      expect(rows()).toEqual(['credits', 'mana'])
    })

    it('should render only the combined row when neither balance covers the price alone', () => {
      // 400 cents of credits + 400 MANA: covers the 300-MANA remainder, not the 500-MANA full price.
      setup({ balanceCents: 400, manaBalanceWei: mana(400) })
      expect(rows()).toEqual(['combined'])
    })

    it('should render combined and mana when MANA alone also covers the price', () => {
      setup({ balanceCents: 400, manaBalanceWei: PRICE_MANA })
      expect(rows()).toEqual(['combined', 'mana'])
    })

    it('should render only the mana row when the buyer holds no credits', () => {
      setup({ balanceCents: 0, manaBalanceWei: PRICE_MANA })
      expect(rows()).toEqual(['mana'])
    })

    it('should render NO unaffordable row (no greyed dead ends)', () => {
      // MANA present but too small for anything → only credits.
      setup({ balanceCents: PRICE_CENTS, manaBalanceWei: mana(1) })
      expect(rows()).toEqual(['credits'])
    })
  })

  describe('the combined row', () => {
    it('should show BOTH legs of the split: the credits spent and the MANA remainder', () => {
      setup({ balanceCents: 400, manaBalanceWei: mana(400) })
      const row = screen.getByTestId('pay-with-combined')
      // 400 cents = 40 credits, and the remainder is 300 MANA.
      expect(row.textContent).toContain('40')
      expect(row.textContent).toContain('300')
    })

    it('should read as one payment made of both legs', () => {
      setup({ balanceCents: 400, manaBalanceWei: mana(400) })
      // "Buy with ◈40 + 300" — the label plus each leg, so the split is explicit on the button itself.
      const label = screen.getByTestId('pay-with-combined').textContent ?? ''
      expect(label).toMatch(/buy with/i)
      expect(label).toContain('40')
      expect(label).toContain('300')
      expect(label).toContain('+')
    })
  })

  describe('one-click payment', () => {
    it('should buy with credits when the credits CTA is pressed (no separate confirm step)', () => {
      const { onBuy } = setup({ balanceCents: PRICE_CENTS })
      fireEvent.click(screen.getByTestId('pay-with-credits'))
      expect(onBuy).toHaveBeenCalledWith('credits')
    })

    it('should buy with MANA when the MANA CTA is pressed', () => {
      const { onBuy } = setup({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA })
      fireEvent.click(screen.getByTestId('pay-with-mana'))
      expect(onBuy).toHaveBeenCalledWith('mana')
    })

    it('should buy with the mixed rail when the combined CTA is pressed', () => {
      const { onBuy } = setup({ balanceCents: 400, manaBalanceWei: mana(400) })
      fireEvent.click(screen.getByTestId('pay-with-combined'))
      expect(onBuy).toHaveBeenCalledWith('combined')
    })
  })

  describe('the exchange-rate caption', () => {
    it('should state how much MANA one credit is worth', () => {
      // 1000 cents = 100 credits costs 500 MANA → 1 credit = 5 MANA.
      setup({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA })
      expect(screen.getByTestId('mana-rate-note').textContent).toMatch(/1 credit = 5 MANA/i)
    })

    it('should omit the caption when the MANA price is unknown', () => {
      setup({ balanceCents: PRICE_CENTS, priceManaWei: 0n })
      expect(screen.queryByTestId('mana-rate-note')).toBeNull()
    })
  })
})
