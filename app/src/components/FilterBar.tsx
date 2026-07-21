import { ReactNode, useState } from 'react'
import type { ShopSort } from '~/lib/api'
import { Chevron } from '~/components/Chevron'
import { Dropdown } from '~/components/Dropdown'
import { t } from '~/intl/i18n'
import * as S from './FilterBar.styles'

// Main-area toolbar for the unified browse grid: the result count + applied-filter chips on the left
// and the Sort By dropdown (+ a mobile-only Filters pill) on the right (Figma nodes 1256-293193 /
// 1304-310186). Owns the single-open-panel state + the click-away scrim used by the inline filters.
// Assets drives Category/Price/Rarity/Status/Smart from the page sidebar and passes `chips`; Collection
// and Creator instead keep Rarity + Price inline in the bar via the optional filter slots below.

// Rarity order + colors follow the Figma "Rarities/*" tokens (see styles/theme.ts `rarities`).
export const RARITIES = ['common', 'uncommon', 'epic', 'rare', 'legendary', 'exotic', 'mythic', 'unique']

// Labels match the Figma sort menu (node 1059-160222). The server supports newest/cheapest/
// most_expensive/name — there is no dedicated "recently listed" sort, so "Newest" covers it.
// `label` holds an i18n key (translated at render — see the Dropdown below) so the menu follows the
// active locale; consumers only read `.key`/`.server`.
export const SORTS: { key: string; label: string; server: ShopSort }[] = [
  { key: 'newest', label: 'filterBar.sortNewest', server: 'newest' },
  { key: 'price-asc', label: 'filterBar.sortCheapest', server: 'cheapest' },
  { key: 'price-desc', label: 'filterBar.sortMostExpensive', server: 'most_expensive' },
  { key: 'name', label: 'filterBar.sortName', server: 'name' }
]

/** An applied-filter chip: a label + the handler that removes just that filter. */
export type FilterChip = { key: string; label: string; onRemove: () => void }

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
    <S.FilterItem>
      <S.FilterTrigger
        className={`${isOpen ? ' is-open' : ''}${active ? ' is-active' : ''}`}
        onClick={() => panel.toggle(panelKey)}
      >
        {label} {badge ? <S.Badge>{badge}</S.Badge> : null}{' '}
        <Chevron up={isOpen} size={24} color="var(--text-2)" />
      </S.FilterTrigger>
      {isOpen ? children : null}
    </S.FilterItem>
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
  chips,
  onClearChips,
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
  /** Opens the mobile filters drawer. The Filters pill only shows on small screens (CSS). */
  onOpenFilters?: () => void
  /** Applied-filter chips (Assets sidebar filters); each removes just its own filter. */
  chips?: FilterChip[]
  /** Clears every applied filter (the "Clear all" link beside the chips). */
  onClearChips?: () => void
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
  // filters from the sidebar and only pass the mobile drawer trigger + applied chips.
  const hasInlineFilters = !!onToggleRarity || !!renderLeading || !!renderTrailing

  return (
    <>
      {open ? <S.Scrim onClick={panel.close} aria-hidden /> : null}
      <S.Toolbar data-testid="browse-toolbar">
        <S.Count data-testid="browse-count">
          {loading ? '…' : t('filterBar.count', { count: total })}
          {query ? ` ${t('filterBar.forQuery', { query })}` : ''}
        </S.Count>

        {chips && chips.length ? (
          <S.Chips data-testid="filter-chips">
            {chips.map(c => (
              <S.Chip key={c.key} onClick={c.onRemove} aria-label={t('filterBar.removeFilter', { filter: c.label })}>
                <span>{c.label}</span>
                <S.ChipClose name="close" aria-hidden />
              </S.Chip>
            ))}
            {onClearChips ? <S.ClearAll onClick={onClearChips}>{t('filterBar.clearAll')}</S.ClearAll> : null}
          </S.Chips>
        ) : null}

        {hasInlineFilters ? (
          <S.InlineFilters>
            {renderLeading?.(panel)}

            {onToggleRarity ? (
              <FilterPanel
                panelKey="rarity"
                label={t('filterBar.rarity')}
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
              <S.ClearAll
                onClick={() => {
                  onClear?.()
                  panel.close()
                }}
              >
                {t('filterBar.clearAll')}
              </S.ClearAll>
            ) : null}
          </S.InlineFilters>
        ) : null}

        <S.Right>
          <Dropdown
            label={t('filterBar.sortBy')}
            ariaLabel={t('filterBar.sortBy')}
            value={sort}
            options={sortOptions.map(s => ({ value: s.key, label: t(s.label) }))}
            onChange={onSort}
            align="right"
            open={panel.open === 'sort'}
            onOpenChange={next => (next ? panel.toggle('sort') : panel.close())}
          />
          {onOpenFilters ? (
            <S.FiltersPill type="button" onClick={onOpenFilters}>
              {t('filterBar.filters')}
              <S.FiltersPillIcon name="filter" aria-hidden />
            </S.FiltersPill>
          ) : null}
        </S.Right>
      </S.Toolbar>
    </>
  )
}
