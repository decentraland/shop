import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from './FilterBar'

const base = {
  sort: 'newest',
  onSort: () => {},
  total: 42,
  loading: false
}

describe('FilterBar', () => {
  describe('when rendered', () => {
    it('should show the result count and the Sort By pill (rarity now lives in the sidebar)', () => {
      render(<FilterBar {...base} />)
      expect(screen.getByText('42 Items')).toBeTruthy()
      expect(screen.getByRole('button', { name: /Sort By/ })).toBeTruthy()
      // Rarity moved out of the toolbar into the sidebar.
      expect(screen.queryByRole('button', { name: /Rarity/ })).toBeNull()
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
})
