import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchListings } from '~/lib/api'
import { AssetCard } from '~/components/AssetCard'
import { CategoryFilter } from '~/components/CategoryFilter'
import { FilterBar, FilterPanel, SORTS } from '~/components/FilterBar'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { SUBCAT_MAP } from '~/lib/categories'
import { CURRENCY } from '~/lib/currency'
import { track } from '~/lib/analytics'

// Items fetched per page (infinite scroll pages by cumulative offset — see useInfiniteGrid).
const PAGE_SIZE = 48

export function Assets() {
  const [searchParams] = useSearchParams()
  const q = (searchParams.get('q') ?? '').trim().toLowerCase()

  const [category, setCategory] = useState('wearable')
  const [subCategory, setSubCategory] = useState<string | null>(null)
  const [rarities, setRarities] = useState<string[]>([])
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [sort, setSort] = useState('newest')

  // Build the server filter set — /v3/catalog/shop does the filtering + sort + search.
  const min = priceMin && !Number.isNaN(Number(priceMin)) ? Number(priceMin) : undefined
  const max = priceMax && !Number.isNaN(Number(priceMax)) ? Number(priceMax) : undefined
  const wearableCategories = subCategory ? SUBCAT_MAP[subCategory] : undefined
  const sortBy = (SORTS.find(s => s.key === sort) ?? SORTS[0]).server
  const filters = {
    category,
    rarities: rarities.length ? rarities : undefined,
    wearableCategories,
    minPriceCredits: min,
    maxPriceCredits: max,
    search: q || undefined,
    sortBy
  }

  const { items, total, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteGrid(
    ['listings', filters],
    skip => fetchListings({ ...filters, first: PAGE_SIZE, skip })
  )
  const resultCount = total

  // Funnel: fire 'Shop Searched'/'Shop Applied Filter' once per change, AFTER results resolve so
  // result_count is accurate (see design/SHOP_TRACKING_SPEC.md §5.2). Refs dedupe + skip the initial load.
  const lastSearched = useRef<string | null>(null)
  useEffect(() => {
    if (isLoading || !q || lastSearched.current === q) return
    lastSearched.current = q
    track('Shop Searched', { query: q, result_count: resultCount })
  }, [q, isLoading, resultCount])

  const lastFilterSig = useRef<string>('__init__')
  useEffect(() => {
    if (isLoading) return
    const sig = JSON.stringify({ category, subCategory, rarities, min, max, sort })
    if (lastFilterSig.current === '__init__' || lastFilterSig.current === sig) {
      lastFilterSig.current = sig
      return
    }
    lastFilterSig.current = sig
    track('Shop Applied Filter', {
      filters: {
        category,
        sub_category: subCategory,
        rarities,
        min_price_credits: min ?? null,
        max_price_credits: max ?? null,
        sort
      },
      result_count: resultCount
    })
  }, [category, subCategory, rarities, min, max, sort, isLoading, resultCount])

  function pickCategory(key: string) {
    setCategory(key)
    setSubCategory(null)
  }
  function toggleRarity(r: string) {
    setRarities(rs => (rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r]))
  }
  function reset() {
    setCategory('wearable')
    setSubCategory(null)
    setRarities([])
    setPriceMin('')
    setPriceMax('')
  }

  const priceActive = !!(min || max)
  const priceLabel = priceActive ? `${priceMin || '0'}–${priceMax || '∞'}` : 'Price'
  const anyActive = category !== 'wearable' || !!subCategory || rarities.length > 0 || priceActive

  return (
    <div className="browse browse--sidebar">
      <aside className="browse__sidebar">
        <CategoryFilter category={category} subCategory={subCategory} onCategory={pickCategory} onSub={setSubCategory} />
      </aside>

      <div className="browse__main">
        <FilterBar
          rarities={rarities}
          onToggleRarity={toggleRarity}
          sort={sort}
          onSort={setSort}
          total={total}
          loading={isLoading}
          query={q}
          anyActive={anyActive}
          onClear={reset}
          renderTrailing={panel => (
            <FilterPanel panelKey="price" label={priceLabel} active={priceActive} panel={panel}>
              <div className="filter-pop filter-pop--price">
                <div className="filter-pop__price-row">
                  <input type="number" min="0" aria-label="Minimum price" placeholder="Min" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
                  <span>–</span>
                  <input type="number" min="0" aria-label="Maximum price" placeholder="Max" value={priceMax} onChange={e => setPriceMax(e.target.value)} />
                </div>
                <p className="filter-pop__hint">Price in {CURRENCY.name}</p>
              </div>
            </FilterPanel>
          )}
        />

        {error ? <p className="error">Couldn&rsquo;t load items — please try again.</p> : null}

        <div className="grid">
          {isLoading ? (
            <SkeletonCards count={15} />
          ) : (
            <>
              {items.map(item => <AssetCard key={item.id} item={item} />)}
              {isFetchingNextPage ? <SkeletonCards count={6} /> : null}
            </>
          )}
        </div>

        <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => fetchNextPage()} />

        {!isLoading && items.length === 0 ? (
          <p className="muted">No items match your filters.</p>
        ) : null}
      </div>
    </div>
  )
}
