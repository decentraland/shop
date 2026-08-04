import { useEffect, useState } from 'react'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { fetchShopItems, type CatalogItem } from '~/lib/api'
import { t } from '~/intl/i18n'
import { theme } from '~/styles/theme'
import * as S from './OutfitItemPicker.styles'

const CATEGORIES = [
  { key: 'wearable', labelKey: 'categories.wearables' },
  { key: 'emote', labelKey: 'categories.emotes' }
] as const
type PickerCategory = (typeof CATEGORIES)[number]['key']

// The studio's catalog picker: search the shop's on-sale wearables or emotes and toggle them into the
// outfit. The category is part of the query, so searching always searches within the selected one.
// Slot consistency is the caller's job (toggleOutfitItem) — this only reports the pick.
export function OutfitItemPicker({
  selectedKeys,
  onPick,
  canPick
}: {
  /** `contract-itemId` keys currently in the outfit. */
  selectedKeys: ReadonlySet<string>
  onPick: (item: CatalogItem) => void
  /**
   * Whether this item can still be taken. Asked per item rather than passed as one "full" flag
   * because capacity is not the whole answer: a full outfit can still accept an item that REPLACES
   * the one already occupying its avatar slot. Deselecting is always allowed.
   */
  canPick: (item: CatalogItem) => boolean
}) {
  const [category, setCategory] = useState<PickerCategory>('wearable')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Primary (buy-from-the-creator) listings only — an outfit must not be built on one-of-a-kind
  // resales — cheapest first, filtered and sorted server-side, paginated with the shared grid hook.
  const {
    items: fetched,
    isLoading,
    isPlaceholderData,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage
  } = useInfiniteGrid(['outfit-picker', category, debounced], skip =>
    fetchShopItems({
      search: debounced || undefined,
      category,
      onSale: true,
      listingType: 'primary',
      first: 24,
      skip,
      sortBy: 'cheapest'
    })
  )
  const searchLabel = t(category === 'emote' ? 'outfits.studio.searchEmotes' : 'outfits.studio.searchWearables')

  // Offset pages can overlap at the boundary while listings move — dedupe so React keys stay unique.
  const seen = new Set<string>()
  const items = fetched.filter(item => {
    if (!item.itemId) return false
    const key = `${item.contractAddress.toLowerCase()}-${item.itemId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return (
    <S.Root data-testid="outfit-picker">
      <S.Categories role="group" aria-label={t('outfits.studio.pickerCategory')} data-testid="outfit-picker-category">
        {CATEGORIES.map(({ key, labelKey }) => (
          <S.CategoryBtn
            key={key}
            type="button"
            data-category={key}
            data-selected={category === key || undefined}
            aria-pressed={category === key}
            onClick={() => { setCategory(key); setQuery('') }}
          >
            {t(labelKey)}
          </S.CategoryBtn>
        ))}
      </S.Categories>
      <S.Search>
        <Icon name="search" color={theme.colors.muted} />
        <input
          value={query}
          placeholder={searchLabel}
          aria-label={searchLabel}
          onChange={e => setQuery(e.target.value)}
          data-testid="outfit-picker-search"
        />
      </S.Search>
      {isError ? (
        <p className="muted small">{t('outfits.errors.generic')}</p>
      ) : isLoading || isPlaceholderData ? (
        <S.Grid aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <S.Placeholder key={i} className="skeleton" aria-hidden />
          ))}
        </S.Grid>
      ) : items.length === 0 ? (
        <p className="muted small">{t('outfits.studio.noResults')}</p>
      ) : (
        <S.Grid>
          {items.map(item => {
            const key = `${item.contractAddress.toLowerCase()}-${item.itemId}`
            const selected = selectedKeys.has(key)
            return (
              <S.Item
                key={key}
                type="button"
                data-testid="outfit-picker-item"
                data-selected={selected || undefined}
                disabled={!selected && !canPick(item)}
                onClick={() => onPick(item)}
                title={item.name}
              >
                <S.Thumb src={item.thumbnail} alt="" loading="lazy" />
                <S.Name>{item.name}</S.Name>
                <S.Price>
                  <CurrencyIcon size={12} />
                  {item.priceCredits.toLocaleString()}
                </S.Price>
                {selected ? <S.Check name="check-rounded" size={18} /> : null}
              </S.Item>
            )
          })}
        </S.Grid>
      )}
      {!isError && !isLoading && !isPlaceholderData ? (
        <LoadMore
          auto={false}
          hasNextPage={!!hasNextPage}
          isFetching={isFetchingNextPage}
          onLoadMore={() => void fetchNextPage()}
        />
      ) : null}
    </S.Root>
  )
}

export default OutfitItemPicker
