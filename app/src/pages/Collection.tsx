import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { t } from '~/intl/i18n'
import { fetchCollection, fetchCollectionItems } from '~/lib/collections'
import { AssetCard } from '~/components/AssetCard'
import { CollectionHero } from '~/components/CollectionHero'
import { CollectionCreatorCard } from '~/components/CollectionCreatorCard'
import { CategoryFilter } from '~/components/CategoryFilter'
import { FilterBar, FilterPanel, SORTS } from '~/components/FilterBar'
import { AddAllToCart } from '~/components/AddAllToCart'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { useSeo } from '~/hooks/useSeo'
import { SUBCAT_MAP } from '~/lib/categories'
import { CURRENCY } from '~/lib/currency'
import './collection.css'

const PAGE_SIZE = 48

// A full-collection storefront: every item of one collection in a grid (discovery — drives more
// primary sales than the item-detail carousel alone). Mirrors the Creator storefront layout — a
// cover-image hero (the creator's store cover) with the collection name, a left sidebar with the
// creator identity block + category filters, and the shared FilterBar + AssetCard grid. The only
// structural difference from the Creator page is the hero header; everything below reuses the same
// browse controls. Reads the classic /v1/items catalog fetch (filters ride along on it — see
// fetchCollectionItems).
export function Collection() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const navigate = useNavigate()

  const [category, setCategory] = useState('wearable')
  const [subCategory, setSubCategory] = useState<string | null>(null)
  const [rarities, setRarities] = useState<string[]>([])
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [sort, setSort] = useState('newest')

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
    sortBy
  }

  const { items, total, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteGrid(
    ['collection-page', contractAddress, filters],
    skip => fetchCollectionItems(contractAddress as string, { ...filters, first: PAGE_SIZE, skip }),
    { enabled: !!contractAddress }
  )

  // Item records don't carry the collection name (it lives on the collections entity), so resolve it
  // separately — mirrors the marketplace's collectionAPI.fetchOne. Falls back to "Collection".
  const { data: collection } = useQuery({
    queryKey: ['collection-meta', contractAddress],
    queryFn: () => fetchCollection(contractAddress as string),
    enabled: !!contractAddress,
    staleTime: 5 * 60_000
  })

  const title = collection?.name || t('collection.fallbackTitle')
  // Per-page SEO — title/description track the collection name once its metadata resolves (until then
  // the hook's site default applies). Indexable.
  useSeo({
    title: collection?.name,
    description: collection?.name ? t('seo.collection.description', { name: collection.name }) : undefined
  })
  // Prefer the collection's own creator; fall back to an item's creator until the metadata loads.
  const creator = collection?.creator || items[0]?.creator

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
  const priceLabel = priceActive ? `${priceMin || '0'}–${priceMax || '∞'}` : t('filter.price')
  const anyActive = category !== 'wearable' || !!subCategory || rarities.length > 0 || priceActive

  return (
    <div className="collection-page">
      <nav className="collection-page__crumbs" aria-label={t('collection.breadcrumbAria')}>
        <button className="collection-page__crumb-link" onClick={() => navigate('/assets')}>
          {t('collection.breadcrumb')}
        </button>
        <span className="collection-page__crumb-sep">/</span>
        <span className="collection-page__crumb-current">{title}</span>
      </nav>

      <CollectionHero name={title} creator={creator} />

      <div className="browse browse--sidebar collection-page__browse">
        <aside className="browse__sidebar">
          <CollectionCreatorCard address={creator} />
          <CategoryFilter
            category={category}
            subCategory={subCategory}
            onCategory={pickCategory}
            onSub={setSubCategory}
            title={t('collection.category')}
            flat
          />
        </aside>

        <div className="browse__main">
          {!isLoading && items.length > 0 ? <AddAllToCart items={items} source="collection" /> : null}

          <FilterBar
            rarities={rarities}
            onToggleRarity={toggleRarity}
            sort={sort}
            onSort={setSort}
            total={total}
            loading={isLoading}
            anyActive={anyActive}
            onClear={reset}
            renderTrailing={panel => (
              <FilterPanel panelKey="price" label={priceLabel} active={priceActive} panel={panel}>
                <div className="filter-pop filter-pop--price">
                  <div className="filter-pop__price-row">
                    <input
                      type="number"
                      min="0"
                      aria-label={t('collection.priceMin')}
                      placeholder={t('collection.priceMinPlaceholder')}
                      value={priceMin}
                      onChange={e => setPriceMin(e.target.value)}
                    />
                    <span>–</span>
                    <input
                      type="number"
                      min="0"
                      aria-label={t('collection.priceMax')}
                      placeholder={t('collection.priceMaxPlaceholder')}
                      value={priceMax}
                      onChange={e => setPriceMax(e.target.value)}
                    />
                  </div>
                  <p className="filter-pop__hint">{t('collection.priceHint', { currency: CURRENCY.name })}</p>
                </div>
              </FilterPanel>
            )}
          />

          {error ? <p className="error">{t('collection.error')}</p> : null}

          <div className="grid">
            {isLoading ? (
              <SkeletonCards count={15} />
            ) : (
              <>
                {items.map(item => (
                  <AssetCard key={item.id} item={item} />
                ))}
                {isFetchingNextPage ? <SkeletonCards count={6} /> : null}
              </>
            )}
          </div>

          <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} />

          {!isLoading && !error && items.length === 0 ? <p className="muted">{t('collection.empty')}</p> : null}
        </div>
      </div>
    </div>
  )
}

export default Collection
