import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar, FilterPanel } from './FilterBar'

const base = {
  rarities: [] as string[],
  onToggleRarity: () => {},
  sort: 'newest',
  onSort: () => {},
  total: 42,
  loading: false,
  anyActive: false,
  onClear: () => {}
}

describe('FilterBar', () => {
  describe('when rendered', () => {
    it('should show the result count and the built-in Rarity + Sort filters', () => {
      render(<FilterBar {...base} />)
      expect(screen.getByText('42 items')).toBeTruthy()
      expect(screen.getByRole('button', { name: /Rarity/ })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Sort by: Newest/ })).toBeTruthy()
    })

    it('should render a singular "item" for a total of one', () => {
      render(<FilterBar {...base} total={1} />)
      expect(screen.getByText('1 item')).toBeTruthy()
    })

    it('should show a placeholder count while loading', () => {
      render(<FilterBar {...base} loading />)
      expect(screen.getByText('…')).toBeTruthy()
    })

    it('should append the query to the count when present', () => {
      render(<FilterBar {...base} query="hat" />)
      expect(screen.getByText(/42 items for “hat”/)).toBeTruthy()
    })
  })

  describe('when the Rarity panel is opened', () => {
    it('should reveal the options and call onToggleRarity on selection', () => {
      const onToggleRarity = vi.fn()
      render(<FilterBar {...base} onToggleRarity={onToggleRarity} />)

      fireEvent.click(screen.getByRole('button', { name: /Rarity/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'rare' }))

      expect(onToggleRarity).toHaveBeenCalledWith('rare')
    })
  })

  describe('when the Sort panel is opened', () => {
    it('should call onSort and close the panel on selection', () => {
      const onSort = vi.fn()
      render(<FilterBar {...base} onSort={onSort} />)

      fireEvent.click(screen.getByRole('button', { name: /Sort by/ }))
      fireEvent.click(screen.getByText('Name (A–Z)'))

      expect(onSort).toHaveBeenCalledWith('name')
      expect(screen.queryByText('Name (A–Z)')).toBeNull()
    })
  })

  describe('when a second panel is opened', () => {
    it('should close the first (only one panel open at a time)', () => {
      render(<FilterBar {...base} />)

      fireEvent.click(screen.getByRole('button', { name: /Rarity/ }))
      expect(screen.getByRole('checkbox', { name: 'rare' })).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: /Sort by/ }))
      expect(screen.queryByRole('checkbox', { name: 'rare' })).toBeNull()
    })
  })

  describe('when Clear all is shown', () => {
    it('should render only when anyActive and call onClear on click', () => {
      const onClear = vi.fn()
      const { rerender } = render(<FilterBar {...base} anyActive={false} onClear={onClear} />)
      expect(screen.queryByText('Clear all')).toBeNull()

      rerender(<FilterBar {...base} anyActive onClear={onClear} />)
      fireEvent.click(screen.getByText('Clear all'))
      expect(onClear).toHaveBeenCalled()
    })
  })

  describe('when a page-specific filter is plugged in via a render slot', () => {
    it('should render it and share the single-open behavior with the built-ins', () => {
      render(
        <FilterBar
          {...base}
          renderTrailing={panel => (
            <FilterPanel panelKey="price" label="Price" panel={panel}>
              <div>PRICE_BODY</div>
            </FilterPanel>
          )}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /Price/ }))
      expect(screen.getByText('PRICE_BODY')).toBeTruthy()

      // Opening Rarity closes the slot's panel.
      fireEvent.click(screen.getByRole('button', { name: /Rarity/ }))
      expect(screen.queryByText('PRICE_BODY')).toBeNull()
    })
  })
})
