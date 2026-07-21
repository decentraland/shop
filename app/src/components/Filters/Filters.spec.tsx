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
      expect((screen.getByRole('radio', { name: /^All$/ }) as HTMLInputElement).checked).toBe(true)
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
