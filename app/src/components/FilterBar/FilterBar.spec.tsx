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
      expect(screen.getByRole('button', { name: /Sort by/i })).toBeTruthy()
      // Rarity moved out of the toolbar into the sidebar.
      expect(screen.queryByRole('button', { name: /Rarity/ })).toBeNull()
    })

    it('should render a singular "Item" for a total of one', () => {
      render(<FilterBar {...base} total={1} />)
      expect(screen.getByText('1 Item')).toBeTruthy()
    })

    it('should shimmer while loading instead of showing an ellipsis', () => {
      render(<FilterBar {...base} loading />)
      // The '…' this replaces was also what a screen reader announced. The bar is sized to the number so
      // the toolbar keeps its height and the grid below cannot shift when the count lands.
      expect(screen.getAllByTestId('browse-count-skeleton').length).toBeGreaterThan(0)
      expect(screen.queryByText('…')).toBeNull()
    })

    it('should append the query to the count when present', () => {
      render(<FilterBar {...base} query="hat" />)
      expect(screen.getByText(/42 Items for “hat”/)).toBeTruthy()
    })
  })

  describe('when a page passes its own search field', () => {
    it('should render it INSIDE the toolbar, beside the count and Sort By', () => {
      // Containment is the whole point of the slot: My Items previously rendered this field as a bar of
      // its own above the toolbar, which is what put two search boxes on that screen. A test that only
      // checked the field exists would still pass if it went back to being a separate row.
      render(<FilterBar {...base} search={<input type="search" aria-label="Search my items" />} />)

      const toolbar = screen.getByTestId('browse-toolbar')
      const field = screen.getByLabelText('Search my items')
      expect(toolbar.contains(field)).toBe(true)
      expect(screen.getByText('42 Items')).toBeTruthy()
      expect(screen.getByRole('button', { name: /Sort by/i })).toBeTruthy()
    })

    it('should render no search field when the page passes none', () => {
      render(<FilterBar {...base} />)
      expect(screen.queryByRole('searchbox')).toBeNull()
    })
  })

  describe('when the Sort panel is opened', () => {
    it('should call onSort and close the panel on selection', () => {
      const onSort = vi.fn()
      render(<FilterBar {...base} onSort={onSort} />)

      fireEvent.click(screen.getByRole('button', { name: /Sort by/i }))
      fireEvent.click(screen.getByText('Name (A–Z)'))

      expect(onSort).toHaveBeenCalledWith('name')
      expect(screen.queryByText('Name (A–Z)')).toBeNull()
    })
  })
})
