import { useMemo, useEffect, useState } from 'react'
import { useUrlFilters } from '~/hooks/useUrlFilters'
import { resolveGridView } from './Creator.view'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchCatalogItems, fetchCreatorCollections } from '~/lib/collections'
import { AssetCard } from '~/components/AssetCard'
import { CollectionCard } from '~/components/CollectionCard'
import { CreatorHero } from '~/components/CreatorHero'
import { Filters, type FilterStatus } from '~/components/Filters'
import { FilterBar, type FilterChip, RARITIES, SORTS } from '~/components/FilterBar'
import { AddAllToCart } from '~/components/AddAllToCart'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { useSeo } from '~/hooks/useSeo'
import { useProfile } from '~/hooks/useProfile'
import { SUBCAT_MAP } from '~/lib/categories'
import { capitalizeFirst } from '~/lib/text'
import { shortAddress } from '~/lib/address'
import { displayCredits } from '~/lib/mana-convert'
import { useManaRate } from '~/hooks/useManaRate'
import { t } from '~/intl/i18n'
import { ErrorNotice } from '~/components/ErrorNotice'
import * as CP from '~/styles/collectionPage.styles'
import * as A from './Assets.styles'
import { Grid } from '~/styles/grid.styles'

const PAGE_SIZE = 48

// A creator's storefront: EVERY item they published, browsable with the same sidebar filters as the main
// Shop grid, scoped to this creator. A cover-image hero (CreatorHero) sits on top.
//
// The grid reads /v3/catalog/items (full catalog, credit-priced) rather than a listings feed, because a
// creator page has to show their body of work whether or not any of it is currently for sale. The old
// /v3/catalog/shop source only knew about NATIVE (shop-native, USD-pegged) listings, so a creator who
// never listed through the Shop — nearly every legacy creator — rendered as an empty storefront.
export function Creator() {
  const { address } = useParams<{ address: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const collectionsMode = searchParams.has('collections')
  const { data: profile } = useProfile(address)
  const name = profile?.name || (address ? shortAddress(address) : t('creator.fallbackName'))

  // Per-page SEO — the creator's display name (or shortened address until the profile loads) as the
  // title, with a creator-scoped description. Indexable.
  //
  // The share image is the creator's own face snapshot (the same one the hero renders), which the profile
  // service serves as a 256x256 square — the shape the hook's square-thumb card is built for. Absent for
  // an address with no profile, in which case the default shop card applies. The store COVER is
  // deliberately not used: it is a user upload of unknown aspect ratio, so it could not be described
  // honestly on either card type.
  useSeo({
    title: name,
    description: t('seo.creator.description', { name }),
    image: profile?.avatar?.snapshots?.face256
  })

  // In the URL, so a refresh or a shared link keeps the filters. This page had NONE of them persisted —
  // every one was local state, so a reload dropped the whole set.
  //
  // 'all' (Shop All), not 'wearable': a creator who only makes emotes must not open on an empty grid. And
  // unlike browse (which opens on 'on_sale'), a storefront opens on everything the creator has made.
  // The URL is user-editable, so a status read out of it is validated against this.
  const STATUSES: FilterStatus[] = ['all', 'on_sale', 'not_for_sale']
  const filterDefaults = useMemo(
    () => ({
      category: 'all',
      status: 'all',
      subCategory: null as string | null,
      rarities: [] as string[],
      priceMin: '',
      priceMax: '',
      smart: false,
      sort: 'newest'
    }),
    []
  )
  const [filterState, setFilters] = useUrlFilters(filterDefaults)
  const { category, subCategory, rarities, priceMin, priceMax, smart, sort } = filterState
  // Validated on read — the URL is user-editable and an unknown status must not reach the query.
  const status: FilterStatus = STATUSES.includes(filterState.status as FilterStatus)
    ? (filterState.status as FilterStatus)
    : 'all'
  const setStatus = (next: FilterStatus) => setFilters({ status: next })
  const [filtersOpen, setFiltersOpen] = useState(false) // mobile filters drawer

  // Close the mobile filters drawer on Escape and lock body scroll while it's open (mirrors Assets).
  useEffect(() => {
    if (!filtersOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltersOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [filtersOpen])

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
    isWearableSmart: smart || undefined,
    // Unset = every item; the sidebar's Status radio narrows it.
    isOnSale: status === 'all' ? undefined : status === 'on_sale',
    sortBy
  }

  // Listings (default) and collections are mutually exclusive: only one query is enabled at a time so
  // switching modes doesn't fire the other's fetch. Both hooks are always called (rules of hooks).
  const {
    items,
    total,
    isLoading,
    isPlaceholderData,
    error,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage
  } = useInfiniteGrid(['creator-items', filters], skip => fetchCatalogItems({ ...filters, first: PAGE_SIZE, skip }), {
    enabled: !!address && !collectionsMode
  })

  // The creator's UNFILTERED item count, so an empty grid can tell "this creator has published nothing"
  // apart from "your filters match nothing". Without it both look identical and the page accuses a
  // working creator of having no work. first=1 — only the total is read.
  const baseline = useQuery({
    queryKey: ['creator-item-count', address],
    queryFn: () => fetchCatalogItems({ creator: address, first: 1 }).then(r => r.total),
    enabled: !!address
  })

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
    setFilters({ category: key, subCategory: null })
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
    setFilters({ rarities: rarities.includes(r) ? rarities.filter(x => x !== r) : [...rarities, r] })
  }
  function clearFilters() {
    setFilters(filterDefaults)
  }

  // Applied-filter chips above the grid; each removes just its own filter (same treatment as browse).
  const chips: FilterChip[] = []
  if (category === 'wearable' || category === 'emote')
    chips.push({
      key: 'category',
      label: t(category === 'emote' ? 'categories.emotes' : 'categories.wearables'),
      onRemove: () => pickCategory('all')
    })
  if (min != null || max != null)
    chips.push({
      key: 'price',
      label: t('filter.price'),
      onRemove: () => {
        setFilters({ priceMin: '', priceMax: '' })
      }
    })
  for (const r of RARITIES)
    if (rarities.includes(r))
      chips.push({ key: `rarity-${r}`, label: capitalizeFirst(r), onRemove: () => toggleRarity(r) })
  if (smart) chips.push({ key: 'smart', label: t('filter.smart'), onRemove: () => setFilters({ smart: false }) })
  if (status !== 'all')
    chips.push({
      key: 'status',
      label: status === 'on_sale' ? t('filter.onSale') : t('filter.notForSale'),
      onRemove: () => setStatus('all')
    })

  // Keep the stale previous page's cards off screen while a new filter set resolves (keepPreviousData).
  const view = resolveGridView({
    gridLoading: isLoading || isPlaceholderData,
    gridError: !!error,
    gridCount: items.length,
    baselinePending: baseline.isPending,
    baselineError: baseline.isError,
    baselineCount: baseline.data
  })
  const showGridSkeletons = view === 'skeletons'

  /**
   * Price every row through the app's ONE display rule before it reaches a card.
   *
   * These rows come from /v3/catalog/items, whose `priceCredits` is converted with the SERVER's MANA rate —
   * not the rate checkout charges. Measured on production: a 20-MANA store mint arrived as 4 credits while
   * the live rate makes it 14, which is what the browse grid (and now the item page) shows. Reading the
   * server number here is what made this page disagree with both.
   */
  const { data: manaRate } = useManaRate()
  const priced = useMemo(
    () => items.map(item => ({ ...item, priceCredits: displayCredits(item, manaRate) })),
    [items, manaRate]
  )
  // "For sale" stays exactly what it was for this feed — a price the server reports — with one addition: a
  // MANA row whose live rate has not resolved yet is still for sale, it just has no number to show. Without
  // that, every store-mint card would flash as NOT FOR SALE for the first frames.
  const isForSale = (item: (typeof priced)[number]) => item.priceCredits > 0 || !!item.manaWei
  const buyable = priced.filter(isForSale)

  // Which of the three empty states applies, if any. They are genuinely different facts and each got
  // reported as "this creator has no items": a failed request, a filter set that excludes everything,
  // and a creator who really has published nothing.
  const emptyKind = view === 'items' || view === 'skeletons' ? null : view

  return (
    <CP.Page>
      <CP.Crumbs aria-label={t('creator.breadcrumbAria')}>
        <CP.CrumbLink onClick={() => navigate('/items')}>{t('creator.breadcrumb')}</CP.CrumbLink>
        <span>/</span>
        <CP.CrumbCurrent>{name}</CP.CrumbCurrent>
      </CP.Crumbs>

      {address ? <CreatorHero address={address} /> : null}

      {!collectionsMode && !showGridSkeletons && buyable.length > 0 ? (
        <AddAllToCart items={buyable} source="creator" />
      ) : null}

      <A.Root>
        {filtersOpen ? <A.Scrim onClick={() => setFiltersOpen(false)} aria-hidden /> : null}
        <A.Sidebar data-open={filtersOpen || undefined} data-testid="creator-sidebar">
          <A.DrawerHead>
            <A.DrawerTitle>{t('assets.filters')}</A.DrawerTitle>
            <A.CloseBtn onClick={() => setFiltersOpen(false)} aria-label={t('assets.closeFilters')}>
              ✕
            </A.CloseBtn>
          </A.DrawerHead>

          <A.SidebarScroll>
            <Filters
              category={category}
              subCategory={subCategory}
              onCategory={pickCategory}
              onSub={v => setFilters({ subCategory: v })}
              priceMin={priceMin}
              priceMax={priceMax}
              onPriceMin={v => setFilters({ priceMin: v })}
              onPriceMax={v => setFilters({ priceMax: v })}
              rarities={rarities}
              onToggleRarity={toggleRarity}
              status={status}
              onStatus={setStatus}
              smart={smart}
              onSmart={v => setFilters({ smart: v })}
              hideNames
              collections={collectionsMode}
              onCollections={toggleCollections}
            />
          </A.SidebarScroll>

          <A.DrawerFoot>
            <A.ShowItems type="button" onClick={() => setFiltersOpen(false)}>
              {t('assets.showItems')}
            </A.ShowItems>
          </A.DrawerFoot>
        </A.Sidebar>

        <A.Main>
          {collectionsMode ? (
            <>
              <CP.CollectionsBar>
                <CP.Count>
                  {collections.isLoading ? '…' : t('creator.collectionsCount', { count: collections.total })}
                </CP.Count>
              </CP.CollectionsBar>

              {collections.error ? <ErrorNotice message={t('creator.error')} /> : null}

              <Grid data-variant="collections">
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
              </Grid>

              <LoadMore
                hasNextPage={collections.hasNextPage}
                isFetching={collections.isFetchingNextPage}
                isError={collections.isFetchNextPageError}
                onLoadMore={() => void collections.fetchNextPage()}
              />

              {!collections.isLoading && !collections.error && collections.items.length === 0 ? (
                <p className="muted">{t('creator.collectionsEmpty')}</p>
              ) : null}
            </>
          ) : (
            <>
              <FilterBar
                sort={sort}
                onSort={v => setFilters({ sort: v })}
                total={total}
                loading={showGridSkeletons}
                onOpenFilters={() => setFiltersOpen(true)}
                chips={chips}
                onClearChips={clearFilters}
              />

              {error ? <ErrorNotice message={t('creator.error')} testId="creator-error" /> : null}

              <Grid data-testid="creator-grid">
                {showGridSkeletons ? (
                  <SkeletonCards count={15} />
                ) : (
                  <>
                    {priced.map(item =>
                      // A creation that isn't for sale has no price and nothing to add to a cart, so it
                      // renders as a VIEW card (same treatment browse gives its not-for-sale grids).
                      isForSale(item) ? (
                        <AssetCard key={item.id} item={item} />
                      ) : (
                        <AssetCard key={item.id} item={item} mode="view" />
                      )
                    )}
                    {isFetchingNextPage ? <SkeletonCards count={6} /> : null}
                  </>
                )}
              </Grid>

              <LoadMore
                hasNextPage={hasNextPage}
                isFetching={isFetchingNextPage}
                isError={isFetchNextPageError}
                onLoadMore={() => void fetchNextPage()}
              />

              {emptyKind === 'error' ? (
                <ErrorNotice message={t('creator.error')} testId="creator-empty-error" />
              ) : emptyKind === 'no-creations' ? (
                <p className="muted" data-testid="creator-empty-none">
                  {t('creator.emptyNoCreations')}
                </p>
              ) : emptyKind === 'filters' ? (
                <A.EmptyState data-testid="creator-empty-filters">
                  <A.EmptyText>
                    <A.EmptyTitle>{t('creator.emptyFilters.title')}</A.EmptyTitle>
                    <A.EmptyBody>{t('creator.emptyFilters.body', { count: baseline.data ?? 0 })}</A.EmptyBody>
                  </A.EmptyText>
                  <A.EmptyCta>
                    <A.EmptyBtn type="button" onClick={clearFilters}>
                      {t('filterBar.clearAll')}
                    </A.EmptyBtn>
                  </A.EmptyCta>
                </A.EmptyState>
              ) : null}
            </>
          )}
        </A.Main>
      </A.Root>
    </CP.Page>
  )
}

export default Creator
