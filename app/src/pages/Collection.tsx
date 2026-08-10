import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { t } from '~/intl/i18n'
import { ErrorNotice } from '~/components/ErrorNotice'
import { EmptyState } from '~/components/EmptyState'
import { fetchCollection, fetchCatalogItems } from '~/lib/collections'
import { AssetCard } from '~/components/AssetCard'
import { CollectionHero } from '~/components/CollectionHero'
import { CollectionCreatorCard } from '~/components/CollectionCreatorCard'
import { Filters, type FilterStatus } from '~/components/Filters'
import { FilterBar, type FilterChip, RARITIES, SORTS } from '~/components/FilterBar'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { useProfile } from '~/hooks/useProfile'
import { useUrlFilters } from '~/hooks/useUrlFilters'
import { shortAddress } from '~/lib/address'
import { useSeo } from '~/hooks/useSeo'
import { useScrollTopOnChange } from '~/hooks/useScrollTopOnChange'
import { SUBCAT_MAP } from '~/lib/categories'
import { rarityLabel } from '~/lib/rarity'
import * as CP from '~/styles/collectionPage.styles'
import * as A from '~/styles/browseLayout.styles'
import { Grid } from '~/styles/grid.styles'
import emptyIllustration from '~/assets/empty/search-empty.svg'

const PAGE_SIZE = 48
const STATUSES: FilterStatus[] = ['all', 'on_sale', 'not_for_sale']

// A full-collection storefront: every item of one collection in a grid (discovery — drives more
// primary sales than the item-detail carousel alone). Mirrors the Creator storefront layout — a
// cover-image hero (the creator's store cover) with the collection name, a left sidebar with the
// creator identity block + the shared Filters, and the shared FilterBar + AssetCard grid.
export function Collection() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const navigate = useNavigate()

  // In the URL, so a refresh or a shared link keeps the filters.
  //
  // 'all' (Shop All): a collection is whatever the creator put in it, so opening on Wearables hid the
  // emotes — and showed an empty grid for an emote-only collection.
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
  // A category is a different set of items, not more of the same one — read it from the top.
  useScrollTopOnChange(`${category}:${subCategory ?? ''}`)
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
    contractAddress,
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

  const { items, total, isLoading, error, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } =
    useInfiniteGrid(['collection-page', filters], skip => fetchCatalogItems({ ...filters, first: PAGE_SIZE, skip }), {
      enabled: !!contractAddress
    })

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
  const { data: creatorProfile } = useProfile(creator)
  const creatorName = creatorProfile?.name || (creator ? shortAddress(creator) : '')

  function pickCategory(key: string) {
    setFilters({ category: key, subCategory: null })
  }
  function toggleRarity(r: string) {
    setFilters({ rarities: rarities.includes(r) ? rarities.filter(x => x !== r) : [...rarities, r] })
  }
  function clearFilters() {
    setFilters(filterDefaults)
  }

  const chips: FilterChip[] = []
  if (min != null || max != null)
    chips.push({
      key: 'price',
      label: t('filter.price'),
      onRemove: () => {
        setFilters({ priceMin: '', priceMax: '' })
      }
    })
  for (const r of RARITIES)
    if (rarities.includes(r)) chips.push({ key: `rarity-${r}`, label: rarityLabel(r), onRemove: () => toggleRarity(r) })
  if (smart) chips.push({ key: 'smart', label: t('filter.smart'), onRemove: () => setFilters({ smart: false }) })
  if (status !== 'all')
    chips.push({
      key: 'status',
      label: status === 'on_sale' ? t('filter.onSale') : t('filter.notForSale'),
      onRemove: () => setStatus('all')
    })

  return (
    <CP.Page data-testid="collection-page">
      <CP.Crumbs aria-label={t('collection.breadcrumbAria')}>
        <CP.CrumbLink onClick={() => navigate('/items')}>{t('collection.breadcrumb')}</CP.CrumbLink>
        {creator ? (
          <>
            <span>/</span>
            <CP.CrumbLink onClick={() => navigate(`/items/creator/${creator}`)}>{creatorName}</CP.CrumbLink>
            <span>/</span>
            <CP.CrumbLink onClick={() => navigate(`/items/creator/${creator}?collections`)}>
              {t('categories.collections')}
            </CP.CrumbLink>
          </>
        ) : null}
        <span>/</span>
        <CP.CrumbCurrent>{title}</CP.CrumbCurrent>
      </CP.Crumbs>

      <CollectionHero name={title} creator={creator} />

      <A.Root data-testid="browse">
        {filtersOpen ? <A.Scrim onClick={() => setFiltersOpen(false)} aria-hidden /> : null}

        {/* The identity card is anchored to the hero (its avatar overhangs into it), so it sits
            OUTSIDE the sticky filter column — only the filters scroll beneath it. */}
        <CP.SidebarCol>
          <CollectionCreatorCard address={creator} />

          <A.Sidebar data-open={filtersOpen || undefined} data-static data-testid="browse-sidebar">
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
              />
            </A.SidebarScroll>

            <A.DrawerFoot>
              <A.ShowItems type="button" onClick={() => setFiltersOpen(false)}>
                {t('assets.showItems')}
              </A.ShowItems>
            </A.DrawerFoot>
          </A.Sidebar>
        </CP.SidebarCol>

        <A.Main>
          <FilterBar
            sort={sort}
            onSort={v => setFilters({ sort: v })}
            total={total}
            loading={isLoading}
            onOpenFilters={() => setFiltersOpen(true)}
            chips={chips}
            onClearChips={clearFilters}
          />

          {error ? <ErrorNotice message={t('collection.error')} /> : null}

          {!isLoading && !error && items.length === 0 ? (
            <EmptyState
              testId="collection-empty"
              icon={emptyIllustration}
              title={t('assets.empty.title')}
              body={t('collection.empty')}
              cta={{ label: t('filterBar.clearAll'), onClick: clearFilters }}
            />
          ) : (
            <>
              <Grid data-testid="grid">
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
              </Grid>

              <LoadMore
                hasNextPage={hasNextPage}
                isFetching={isFetchingNextPage}
                isError={isFetchNextPageError}
                onLoadMore={() => void fetchNextPage()}
              />
            </>
          )}
        </A.Main>
      </A.Root>
    </CP.Page>
  )
}

export default Collection
