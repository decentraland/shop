import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { fetchListings } from '~/lib/api'
import { fetchCreatorCollections } from '~/lib/collections'
import { AssetCard } from '~/components/AssetCard'
import { CollectionCard } from '~/components/CollectionCard'
import { CreatorHero } from '~/components/CreatorHero'
import { CategoryFilter } from '~/components/CategoryFilter'
import { FilterBar, FilterPanel, SORTS } from '~/components/FilterBar'
import { AddAllToCart } from '~/components/AddAllToCart'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { useSeo } from '~/hooks/useSeo'
import { useProfile } from '~/hooks/useProfile'
import { SUBCAT_MAP } from '~/lib/categories'
import { CURRENCY } from '~/lib/currency'
import { shortAddress } from '~/lib/address'
import { t } from '~/intl/i18n'
import { ErrorNotice } from '~/components/ErrorNotice'
import './collection.css'

const PAGE_SIZE = 48

// A creator's storefront: their credit-buyable listings, browsable with the same category/rarity/
// price/sort controls as the main Shop grid — scoped to this creator via /v3/catalog/shop?creator=.
// A cover-image hero (CreatorHero) sits on top. Prices are true shop credits (not the MANA the old
// /v1/items feed returned), because this now reads the curated USD-pegged shop catalog.
export function Creator() {
  const { address } = useParams<{ address: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const collectionsMode = searchParams.has('collections')
  const { data: profile } = useProfile(address)
  const name = profile?.name || (address ? shortAddress(address) : t('creator.fallbackName'))

  // Per-page SEO — the creator's display name (or shortened address until the profile loads) as the
  // title, with a creator-scoped description. Indexable.
  useSeo({ title: name, description: t('seo.creator.description', { name }) })

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
    creator: address,
    category,
    rarities: rarities.length ? rarities : undefined,
    wearableCategories,
    minPriceCredits: min,
    maxPriceCredits: max,
    sortBy
  }

  // Listings (default) and collections are mutually exclusive: only one query is enabled at a time so
  // switching modes doesn't fire the other's fetch. Both hooks are always called (rules of hooks).
  const { items, total, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteGrid(
    ['creator-listings', filters],
    skip => fetchListings({ ...filters, first: PAGE_SIZE, skip }),
    { enabled: !!address && !collectionsMode }
  )

  const collections = useInfiniteGrid(
    ['creator-collections', address],
    skip =>
      fetchCreatorCollections(address as string, { first: PAGE_SIZE, skip }).then(r => ({
        items: r.collections,
        total: r.total
      })),
    { enabled: !!address && collectionsMode }
  )

  function pickCategory(key: string) {
    setCategory(key)
    setSubCategory(null)
    if (collectionsMode) clearCollections()
  }
  // "Collections" is a URL-driven mode (adds a valueless `&collections`), mutually exclusive with the
  // category filter. Toggle it on/off while preserving any other query params. Built by hand (not via
  // setSearchParams) so the flag stays bare `?collections`, not `?collections=`.
  function clearCollections() {
    const rest = new URLSearchParams(searchParams)
    rest.delete('collections')
    const s = rest.toString()
    navigate({ search: s ? `?${s}` : '' }, { replace: true })
  }
  function toggleCollections() {
    if (collectionsMode) {
      clearCollections()
      return
    }
    const rest = new URLSearchParams(searchParams)
    rest.delete('collections')
    const s = rest.toString()
    navigate({ search: s ? `?${s}&collections` : '?collections' }, { replace: true })
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
      <nav className="collection-page__crumbs" aria-label={t('creator.breadcrumbAria')}>
        <button className="collection-page__crumb-link" onClick={() => navigate('/assets')}>
          {t('creator.breadcrumb')}
        </button>
        <span className="collection-page__crumb-sep">/</span>
        <span className="collection-page__crumb-current">{name}</span>
      </nav>

      {address ? <CreatorHero address={address} /> : null}

      {!collectionsMode && !isLoading && items.length > 0 ? <AddAllToCart items={items} source="creator" /> : null}

      <div className="browse browse--sidebar">
        <aside className="browse__sidebar">
          <CategoryFilter
            category={category}
            subCategory={subCategory}
            onCategory={pickCategory}
            onSub={setSubCategory}
            title={t('creator.category')}
            flat
            collections={collectionsMode}
            onCollections={toggleCollections}
          />
        </aside>

        <div className="browse__main">
          {collectionsMode ? (
            <>
              <div className="creator-collections__bar">
                <span className="assets__count">
                  {collections.isLoading ? '…' : t('creator.collectionsCount', { count: collections.total })}
                </span>
              </div>

              {collections.error ? <ErrorNotice message={t('creator.error')} /> : null}

              <div className="grid grid--collections">
                {collections.isLoading ? (
                  <SkeletonCards count={9} />
                ) : (
                  <>
                    {collections.items.map(c => (
                      <CollectionCard key={c.contractAddress} collection={c} itemCount={c.itemCount} />
                    ))}
                    {collections.isFetchingNextPage ? <SkeletonCards count={6} /> : null}
                  </>
                )}
              </div>

              <LoadMore
                hasNextPage={collections.hasNextPage}
                isFetching={collections.isFetchingNextPage}
                onLoadMore={() => void collections.fetchNextPage()}
              />

              {!collections.isLoading && !collections.error && collections.items.length === 0 ? (
                <p className="muted">{t('creator.collectionsEmpty')}</p>
              ) : null}
            </>
          ) : (
            <>
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
                          aria-label={t('creator.priceMin')}
                          placeholder={t('creator.priceMinPlaceholder')}
                          value={priceMin}
                          onChange={e => setPriceMin(e.target.value)}
                        />
                        <span>–</span>
                        <input
                          type="number"
                          min="0"
                          aria-label={t('creator.priceMax')}
                          placeholder={t('creator.priceMaxPlaceholder')}
                          value={priceMax}
                          onChange={e => setPriceMax(e.target.value)}
                        />
                      </div>
                      <p className="filter-pop__hint">{t('creator.priceHint', { currency: CURRENCY.name })}</p>
                    </div>
                  </FilterPanel>
                )}
              />

              {error ? <ErrorNotice message={t('creator.error')} /> : null}

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

              <LoadMore
                hasNextPage={hasNextPage}
                isFetching={isFetchingNextPage}
                onLoadMore={() => void fetchNextPage()}
              />

              {!isLoading && !error && items.length === 0 ? <p className="muted">{t('creator.empty')}</p> : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Creator
