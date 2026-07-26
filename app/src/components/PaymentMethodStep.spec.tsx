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

function setup(over: { balanceCents?: number; manaBalanceWei?: bigint; selected?: 'credits' | 'mana' | 'combined' }) {
  const balanceCents = over.balanceCents ?? 0
  const manaBalanceWei = over.manaBalanceWei ?? 0n
  const computed = computePaymentOptions({
    priceCents: PRICE_CENTS,
    priceManaWei: PRICE_MANA,
    balanceCents,
    manaBalanceWei
  })
  const onSelect = vi.fn()
  const onBuy = vi.fn()
  render(
    <PaymentMethodStep
      item={item}
      priceCredits={100}
      priceCents={PRICE_CENTS}
      balanceCents={balanceCents}
      manaBalanceWei={manaBalanceWei}
      options={computed.options}
      selected={over.selected ?? computed.preferred ?? 'credits'}
      onSelect={onSelect}
      onBuy={onBuy}
      onClose={vi.fn()}
    />
  )
  return { onSelect, onBuy }
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

    it('should label itself as the mixed rail', () => {
      setup({ balanceCents: 400, manaBalanceWei: mana(400) })
      expect(screen.getByTestId('pay-with-combined').textContent).toMatch(/credits \+ mana/i)
    })
  })

  describe('selection', () => {
    it('should mark the selected row as checked and the others as not', () => {
      setup({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA, selected: 'mana' })
      expect(screen.getByTestId('pay-with-mana')).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByTestId('pay-with-credits')).toHaveAttribute('aria-checked', 'false')
    })

    it('should report the clicked method', () => {
      const { onSelect } = setup({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA })
      fireEvent.click(screen.getByTestId('pay-with-mana'))
      expect(onSelect).toHaveBeenCalledWith('mana')
    })

    it('should pre-select credits when both single rails are available', () => {
      setup({ balanceCents: PRICE_CENTS, manaBalanceWei: PRICE_MANA })
      expect(screen.getByTestId('pay-with-credits')).toHaveAttribute('aria-checked', 'true')
    })

    it('should pre-select combined when the credits alone fall short', () => {
      setup({ balanceCents: 400, manaBalanceWei: PRICE_MANA })
      expect(screen.getByTestId('pay-with-combined')).toHaveAttribute('aria-checked', 'true')
    })
  })

  describe('the confirm button', () => {
    it('should fire onBuy', () => {
      const { onBuy } = setup({ balanceCents: PRICE_CENTS })
      fireEvent.click(screen.getByTestId('pay-confirm'))
      expect(onBuy).toHaveBeenCalled()
    })
  })
})
