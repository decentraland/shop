import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from './FilterBar'

const base = {
  rarities: [] as string[],
  onToggleRarity: () => {},
  sort: 'newest',
  onSort: () => {},
  total: 42,
  loading: false
}

describe('FilterBar', () => {
  describe('when rendered', () => {
    it('should show the result count and the Rarity + Sort By pills', () => {
      render(<FilterBar {...base} />)
      expect(screen.getByText('42 Items')).toBeTruthy()
      expect(screen.getByRole('button', { name: /Rarity/ })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Sort By/ })).toBeTruthy()
    })

    it('should render a singular "Item" for a total of one', () => {
      render(<FilterBar {...base} total={1} />)
      expect(screen.getByText('1 Item')).toBeTruthy()
    })

    it('should show a placeholder count while loading', () => {
      render(<FilterBar {...base} loading />)
      expect(screen.getByText('…')).toBeTruthy()
    })

    it('should append the query to the count when present', () => {
      render(<FilterBar {...base} query="hat" />)
      expect(screen.getByText(/42 Items for “hat”/)).toBeTruthy()
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

      fireEvent.click(screen.getByRole('button', { name: /Sort By/ }))
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

      fireEvent.click(screen.getByRole('button', { name: /Sort By/ }))
      expect(screen.queryByRole('checkbox', { name: 'rare' })).toBeNull()
    })
  })
})
