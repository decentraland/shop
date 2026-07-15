import { ReactNode, useState } from 'react'
import type { ShopSort } from '~/lib/api'

// Main-area toolbar for the unified browse grid: the result count on the left + the Sort By dropdown
// "pill" on the right (Figma "New Shop 2026"). Owns the single-open-panel state + the click-away
// scrim. Category, Price and Rarity filters all live in the page sidebar (see Assets.tsx).

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique', 'exotic']

export const SORTS: { key: string; label: string; server: ShopSort }[] = [
  { key: 'newest', label: 'Newest', server: 'newest' },
  { key: 'price-asc', label: 'Price: Low to High', server: 'cheapest' },
  { key: 'price-desc', label: 'Price: High to Low', server: 'most_expensive' },
  { key: 'name', label: 'Name (A–Z)', server: 'name' }
]

/** Controls which popover (if any) is open — only one at a time. */
export type PanelController = {
  open: string | null
  toggle: (key: string) => void
  close: () => void
}

/**
 * A filter trigger + its popover, wired to the shared panel controller. Used both by the built-in
 * filters and by the page-specific slots so they match styling + single-open behavior. `align='right'`
 * uses the sort-style trigger (right side of the bar).
 */
function FilterPanel({
  panelKey,
  label,
  active,
  badge,
  align = 'left',
  panel,
  children
}: {
  panelKey: string
  label: ReactNode
  active?: boolean
  badge?: number
  align?: 'left' | 'right'
  panel: PanelController
  children: ReactNode
}) {
  const isOpen = panel.open === panelKey
  const triggerClass = align === 'right' ? 'filterbar__sort' : 'filterbar__trigger'
  return (
    <div className="filterbar__item">
      <button
        className={`${triggerClass}${isOpen ? ' is-open' : ''}${active ? ' is-active' : ''}`}
        onClick={() => panel.toggle(panelKey)}
      >
        {label} {badge ? <span className="filterbar__badge">{badge}</span> : null}{' '}
        <span className={`ico ico-chevron filterbar__chev${isOpen ? ' is-up' : ''}`} aria-hidden />
      </button>
      {isOpen ? children : null}
    </div>
  )
}

export function FilterBar({
  sort,
  onSort,
  sortOptions = SORTS,
  total,
  loading,
  query,
  onOpenFilters
}: {
  sort: string
  onSort: (key: string) => void
  sortOptions?: { key: string; label: string; server: ShopSort }[]
  total: number
  loading: boolean
  query?: string
  /** Opens the mobile filters drawer. The trigger only shows on small screens (CSS). */
  onOpenFilters?: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const panel: PanelController = {
    open,
    toggle: key => setOpen(current => (current === key ? null : key)),
    close: () => setOpen(null)
  }

  return (
    <>
      {open ? <div className="filterbar__scrim" onClick={panel.close} aria-hidden /> : null}
      <div className="browse__toolbar">
        <span className="browse__count">
          {loading ? '…' : `${total.toLocaleString()} Item${total === 1 ? '' : 's'}`}
          {query ? ` for “${query}”` : ''}
        </span>

        <div className="browse__dropdowns">
          {onOpenFilters ? (
            <button type="button" className="browse__filters-btn" onClick={onOpenFilters}>
              Filters
            </button>
          ) : null}
          <FilterPanel panelKey="sort" label="Sort By" align="right" panel={panel}>
            <div className="filter-pop filter-pop--sort">
              {sortOptions.map(s => (
                <button
                  key={s.key}
                  className={`filter-pop__sort${s.key === sort ? ' is-active' : ''}`}
                  onClick={() => {
                    onSort(s.key)
                    panel.close()
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </FilterPanel>
        </div>
      </div>
    </>
  )
}
