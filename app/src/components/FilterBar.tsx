import { ReactNode, useState } from 'react'
import type { ShopSort } from '~/lib/api'
import { Dropdown } from '~/components/Dropdown'

// Main-area toolbar for the unified browse grid: the result count on the left + the Sort By dropdown
// "pill" on the right (Figma "New Shop 2026"). Owns the single-open-panel state + the click-away
// scrim. Assets drives Category/Price/Rarity from the page sidebar; Collection and Creator instead
// keep Rarity + Price inline in the bar via the optional filter slots below.

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique', 'exotic']

// Labels match the Figma sort menu (node 1059-160222). The server supports newest/cheapest/
// most_expensive/name — there is no dedicated "recently listed" sort, so "Newest" covers it.
export const SORTS: { key: string; label: string; server: ShopSort }[] = [
  { key: 'newest', label: 'Newest', server: 'newest' },
  { key: 'price-asc', label: 'Cheapest', server: 'cheapest' },
  { key: 'price-desc', label: 'Most Expensive', server: 'most_expensive' },
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
  sort,
  onSort,
  sortOptions = SORTS,
  total,
  loading,
  query,
  onOpenFilters,
  rarities,
  onToggleRarity,
  rarityOptions = RARITIES,
  anyActive,
  onClear,
  renderLeading,
  renderTrailing
}: {
  sort: string
  onSort: (key: string) => void
  sortOptions?: { key: string; label: string; server: ShopSort }[]
  total: number
  loading: boolean
  query?: string
  /** Opens the mobile filters drawer. The trigger only shows on small screens (CSS). */
  onOpenFilters?: () => void
  // Inline-filter slots for pages that keep Rarity/Price in the bar itself (Collection, Creator)
  // rather than in the page sidebar (Assets). All optional: a page opts into the inline filter row by
  // passing them; when omitted the bar renders just the count + Sort (+ mobile Filters button).
  rarities?: string[]
  onToggleRarity?: (rarity: string) => void
  rarityOptions?: string[]
  anyActive?: boolean
  onClear?: () => void
  /** Rendered before the Rarity panel (e.g. Market's Section dropdown). */
  renderLeading?: (panel: PanelController) => ReactNode
  /** Rendered after the Rarity panel (e.g. the Price range panel). */
  renderTrailing?: (panel: PanelController) => ReactNode
}) {
  const [open, setOpen] = useState<string | null>(null)
  const panel: PanelController = {
    open,
    toggle: key => setOpen(current => (current === key ? null : key)),
    close: () => setOpen(null)
  }
  // Pages using the inline filter row opt in via any of the filter slots; the rest (Assets) drive
  // filters from the sidebar and only pass the mobile drawer trigger.
  const hasInlineFilters = !!onToggleRarity || !!renderLeading || !!renderTrailing

  return (
    <>
      {open ? <div className="filterbar__scrim" onClick={panel.close} aria-hidden /> : null}
      <div className="browse__toolbar" data-testid="browse-toolbar">
        <span className="browse__count">
          {loading ? '…' : `${total.toLocaleString()} Item${total === 1 ? '' : 's'}`}
          {query ? ` for “${query}”` : ''}
        </span>

        {hasInlineFilters ? (
          <div className="filterbar__filters">
            {renderLeading?.(panel)}

            {onToggleRarity ? (
              <FilterPanel
                panelKey="rarity"
                label="Rarity"
                active={(rarities?.length ?? 0) > 0}
                badge={rarities?.length || undefined}
                panel={panel}
              >
                <div className="filter-pop filter-pop--rarity">
                  {rarityOptions.map(r => (
                    <label key={r} className="filter-pop__check">
                      <input
                        type="checkbox"
                        checked={rarities?.includes(r) ?? false}
                        onChange={() => onToggleRarity(r)}
                      />
                      <span>{r}</span>
                    </label>
                  ))}
                </div>
              </FilterPanel>
            ) : null}

            {renderTrailing?.(panel)}

            {anyActive ? (
              <button
                className="filterbar__clear"
                onClick={() => {
                  onClear?.()
                  panel.close()
                }}
              >
                Clear all
              </button>
            ) : null}
          </div>
        ) : (
          <div className="browse__dropdowns">
            {onOpenFilters ? (
              <button type="button" className="browse__filters-btn" onClick={onOpenFilters}>
                <span className="ico ico-filter" aria-hidden />
                Filters
              </button>
            ) : null}
          </div>
        )}

        <div className="filterbar__right">
          <span className="filterbar__count">
            {loading ? '…' : `${total.toLocaleString()} item${total === 1 ? '' : 's'}`}
            {query ? ` for “${query}”` : ''}
          </span>
          <Dropdown
            label="Sort by"
            ariaLabel="Sort by"
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
