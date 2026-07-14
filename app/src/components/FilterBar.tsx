import { ReactNode, useState } from 'react'
import type { ShopSort } from '~/lib/api'
import { Dropdown } from '~/components/Dropdown'

// Shared horizontal filter bar for the browse grids (Assets + Market). Owns the single-open-panel
// state (only one popover at a time) + the click-away scrim, and renders the filters both pages share:
// Rarity, Sort, the result count, and Clear. Page-specific filters plug in via render slots —
// `renderLeading` (Market's Section dropdown) and `renderTrailing` (Assets' Price range) — both wired
// to the same panel controller so they share the single-open behavior and styling.

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
 * A filter trigger + its popover (checkbox/range style), wired to the shared panel controller. Used by
 * the built-in Rarity filter and the page-specific slots so they match styling + single-open behavior.
 * For a single-select dropdown (Sort By), use the standalone <Dropdown> instead.
 */
export function FilterPanel({
  panelKey,
  label,
  active,
  badge,
  panel,
  children
}: {
  panelKey: string
  label: ReactNode
  active?: boolean
  badge?: number
  panel: PanelController
  children: ReactNode
}) {
  const isOpen = panel.open === panelKey
  return (
    <div className="filterbar__item">
      <button
        className={`filterbar__trigger${isOpen ? ' is-open' : ''}${active ? ' is-active' : ''}`}
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
  rarities,
  onToggleRarity,
  rarityOptions = RARITIES,
  sort,
  onSort,
  sortOptions = SORTS,
  total,
  loading,
  query,
  anyActive,
  onClear,
  renderLeading,
  renderTrailing
}: {
  rarities: string[]
  onToggleRarity: (rarity: string) => void
  rarityOptions?: string[]
  sort: string
  onSort: (key: string) => void
  sortOptions?: { key: string; label: string; server: ShopSort }[]
  total: number
  loading: boolean
  query?: string
  anyActive: boolean
  onClear: () => void
  /** Rendered before Rarity (Market: Section). */
  renderLeading?: (panel: PanelController) => ReactNode
  /** Rendered after Rarity (Assets: Price). */
  renderTrailing?: (panel: PanelController) => ReactNode
}) {
  const [open, setOpen] = useState<string | null>(null)
  const panel: PanelController = {
    open,
    toggle: key => setOpen(current => (current === key ? null : key)),
    close: () => setOpen(null)
  }
  const currentSort = sortOptions.find(s => s.key === sort) ?? sortOptions[0]

  return (
    <>
      {open ? <div className="filterbar__scrim" onClick={panel.close} aria-hidden /> : null}
      <div className="filterbar">
        <div className="filterbar__filters">
          {renderLeading?.(panel)}

          <FilterPanel
            panelKey="rarity"
            label="Rarity"
            active={rarities.length > 0}
            badge={rarities.length || undefined}
            panel={panel}
          >
            <div className="filter-pop filter-pop--rarity">
              {rarityOptions.map(r => (
                <label key={r} className="filter-pop__check">
                  <input type="checkbox" checked={rarities.includes(r)} onChange={() => onToggleRarity(r)} />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </FilterPanel>

          {renderTrailing?.(panel)}

          {anyActive ? (
            <button
              className="filterbar__clear"
              onClick={() => {
                onClear()
                panel.close()
              }}
            >
              Clear all
            </button>
          ) : null}
        </div>

        <div className="filterbar__right">
          <span className="filterbar__count">
            {loading ? '…' : `${total.toLocaleString()} item${total === 1 ? '' : 's'}`}
            {query ? ` for “${query}”` : ''}
          </span>
          <Dropdown
            label="Sort by"
            ariaLabel={`Sort by: ${currentSort.label}`}
            value={sort}
            options={sortOptions.map(s => ({ value: s.key, label: s.label }))}
            onChange={onSort}
            align="right"
            open={panel.open === 'sort'}
            onOpenChange={next => (next ? panel.toggle('sort') : panel.close())}
          />
        </div>
      </div>
    </>
  )
}
