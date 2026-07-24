import { ReactNode, useState } from 'react'
import type { ShopSort } from '~/lib/api'
import { Icon } from '~/components/Icon'
import { Chevron } from '~/components/Chevron'
import { Dropdown } from '~/components/Dropdown'
import { Pop, Check } from '~/styles/filterPop.styles'
import { t } from '~/intl/i18n'
import * as S from './FilterBar.styles'

// Main-area toolbar for the unified browse grid: the result count on the left + the Sort By dropdown
// "pill" on the right (Figma "New Shop 2026"). Owns the single-open-panel state + the click-away
// scrim. Assets drives Category/Price/Rarity from the page sidebar; Collection and Creator instead
// keep Rarity + Price inline in the bar via the optional filter slots below.

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique', 'exotic']

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
    <S.Item>
      <S.Trigger
        data-open={isOpen || undefined}
        data-active={active || undefined}
        onClick={() => panel.toggle(panelKey)}
      >
        {label} {badge ? <S.Badge>{badge}</S.Badge> : null} <Chevron up={isOpen} size={24} color="var(--text-2)" />
      </S.Trigger>
      {isOpen ? children : null}
    </S.Item>
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
      {open ? <S.Scrim onClick={panel.close} aria-hidden /> : null}
      <S.Toolbar data-testid="browse-toolbar">
        <S.Count data-testid="browse-count">
          {loading ? '…' : t('filterBar.count', { count: total })}
          {query ? ` ${t('filterBar.forQuery', { query })}` : ''}
        </S.Count>

        {hasInlineFilters ? (
          <S.Filters>
            {renderLeading?.(panel)}

            {onToggleRarity ? (
              <FilterPanel
                panelKey="rarity"
                label={t('filterBar.rarity')}
                active={(rarities?.length ?? 0) > 0}
                badge={rarities?.length || undefined}
                panel={panel}
              >
                <Pop data-variant="rarity">
                  {rarityOptions.map(r => (
                    <Check key={r}>
                      <input
                        type="checkbox"
                        checked={rarities?.includes(r) ?? false}
                        onChange={() => onToggleRarity(r)}
                      />
                      <span>{r}</span>
                    </Check>
                  ))}
                </Pop>
              </FilterPanel>
            ) : null}

            {renderTrailing?.(panel)}

            {anyActive ? (
              <S.Clear
                onClick={() => {
                  onClear?.()
                  panel.close()
                }}
              >
                {t('filterBar.clearAll')}
              </S.Clear>
            ) : null}
          </S.Filters>
        ) : (
          <S.Dropdowns>
            {onOpenFilters ? (
              <S.FiltersBtn type="button" onClick={onOpenFilters} aria-label={t('filterBar.filters')}>
                <Icon name="filter" color="var(--text-2)" />
              </S.FiltersBtn>
            ) : null}
          </S.Dropdowns>
        )}

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
        </S.Right>
      </S.Toolbar>
    </>
  )
}
