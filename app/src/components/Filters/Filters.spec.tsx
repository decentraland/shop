import { type ComponentProps } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Filters } from './Filters'

const base: ComponentProps<typeof Filters> = {
  category: 'wearable',
  subCategory: null,
  onCategory: () => {},
  onSub: () => {},
  priceMin: '',
  priceMax: '',
  onPriceMin: () => {},
  onPriceMax: () => {},
  rarities: [],
  onToggleRarity: () => {},
  status: 'all',
  onStatus: () => {},
  smart: false,
  onSmart: () => {}
}

describe('Filters', () => {
  describe('when the Status filter is rendered', () => {
    it('should show All / On Sale / Not for Sale with the current status selected', () => {
      render(<Filters {...base} status="all" />)
      expect(screen.getByRole<HTMLInputElement>('radio', { name: /^All$/ }).checked).toBe(true)
      expect(screen.getByRole('radio', { name: /On Sale/ })).toBeTruthy()
      expect(screen.getByRole('radio', { name: /Not for Sale/ })).toBeTruthy()
    })

    it('should call onStatus with the picked value', () => {
      const onStatus = vi.fn()
      render(<Filters {...base} onStatus={onStatus} />)
      fireEvent.click(screen.getByRole('radio', { name: /On Sale/ }))
      expect(onStatus).toHaveBeenCalledWith('on_sale')
    })
  })

  describe('when the Smart toggle is rendered', () => {
    it('should reflect the smart prop via aria-checked and toggle it on click', () => {
      const onSmart = vi.fn()
      render(<Filters {...base} smart={false} onSmart={onSmart} />)
      const toggle = screen.getByRole('switch', { name: /smart/i })
      expect(toggle.getAttribute('aria-checked')).toBe('false')
      fireEvent.click(toggle)
      expect(onSmart).toHaveBeenCalledWith(true)
    })
  })

  describe('when a price thumb is dragged', () => {
    // Every tick used to reach the URL, so one drag refetched the grid dozens of times and the page
    // collapsed and sprang back under the cursor on each one.
    it('should not touch the price until the thumb is released', () => {
      const onPriceMax = vi.fn()
      render(<Filters {...base} onPriceMax={onPriceMax} />)
      const max = screen.getByRole('slider', { name: /max/i })

      for (const value of ['170', '150', '130']) fireEvent.change(max, { target: { value } })
      expect(onPriceMax).not.toHaveBeenCalled()

      fireEvent.pointerUp(max)
      expect(onPriceMax).toHaveBeenCalledTimes(1)
    })

    it('should still move the thumb and the Max box while the drag is in flight', () => {
      render(<Filters {...base} />)
      const max = screen.getByRole<HTMLInputElement>('slider', { name: /max/i })
      fireEvent.change(max, { target: { value: '120' } })
      expect(max.value).toBe('120')
      expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: /max/i }).value).not.toBe('')
    })
  })

  describe('when the Rarity chips are rendered', () => {
    it('should render one chip per rarity and toggle the clicked rarity', () => {
      const onToggleRarity = vi.fn()
      render(<Filters {...base} onToggleRarity={onToggleRarity} />)
      expect(screen.getAllByTestId('rarity-filter-check')).toHaveLength(8)
      fireEvent.click(screen.getByRole('button', { name: /legendary/i }))
      expect(onToggleRarity).toHaveBeenCalledWith('legendary')
    })
  })
})
