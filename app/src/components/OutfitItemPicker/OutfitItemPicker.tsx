import { useEffect, useState } from 'react'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { fetchShopItems, type CatalogItem } from '~/lib/api'
import { t } from '~/intl/i18n'
import { theme } from '~/styles/theme'
import * as S from './OutfitItemPicker.styles'

// The studio's catalog picker: search the shop's on-sale wearables and toggle them into the outfit.
// Slot consistency is the caller's job (toggleOutfitItem) — this only reports the pick.
export function OutfitItemPicker({
  selectedKeys,
  onPick,
  full
}: {
  /** `contract-itemId` keys currently in the outfit. */
  selectedKeys: ReadonlySet<string>
  onPick: (item: CatalogItem) => void
  /** Outfit at capacity — adding disables, deselecting still works. */
  full?: boolean
}) {
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
  } = useInfiniteGrid(['outfit-picker', debounced], skip =>
    fetchShopItems({
      search: debounced || undefined,
      category: 'wearable',
      onSale: true,
      listingType: 'primary',
      first: 24,
      skip,
      sortBy: 'cheapest'
    })
  )
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
      <S.Search>
        <Icon name="search" color={theme.colors.muted} />
        <input
          value={query}
          placeholder={t('outfits.studio.searchPlaceholder')}
          aria-label={t('outfits.studio.searchPlaceholder')}
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
                disabled={full && !selected}
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
