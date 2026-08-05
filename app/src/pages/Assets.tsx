import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUrlFilters } from '~/hooks/useUrlFilters'
import { useScrollTopOnChange } from '~/hooks/useScrollTopOnChange'
import { fetchShopItems, type CatalogItem, type UnifiedListing } from '~/lib/api'
import { useSecondarySales } from '~/hooks/useSecondarySales'
import { fetchCatalogItems } from '~/lib/collections'
import { manaWeiToCredits } from '~/lib/mana-rate'
import { useManaRate } from '~/hooks/useManaRate'
import { AssetCard } from '~/components/AssetCard'
import { Filters, type FilterStatus } from '~/components/Filters'
import { FilterBar, type FilterChip, RARITIES, SORTS } from '~/components/FilterBar'
import { SkeletonCards } from '~/components/SkeletonCards'
import { listingKey } from '~/lib/listingKey'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { useSeo } from '~/hooks/useSeo'
import { SUBCAT_MAP } from '~/lib/categories'
import { rarityLabel } from '~/lib/rarity'
import { track } from '~/lib/analytics'
import { t } from '~/intl/i18n'
import { ErrorNotice } from '~/components/ErrorNotice'
import { NamesPage } from '~/pages/NamesPage'
import { Grid } from '~/styles/grid.styles'
import emptyIllustration from '~/assets/error/search-empty.svg'
import * as S from './Assets.styles'

// Items fetched per page (infinite scroll pages by cumulative offset — see useInfiniteGrid).
const PAGE_SIZE = 48

const STATUSES: FilterStatus[] = ['all', 'on_sale', 'not_for_sale']

export function Assets() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const q = (searchParams.get('q') ?? '').trim().toLowerCase()

  // Collectibles grid SEO. Fold the (case-preserved) search term into the title when present; the
  // description stays generic. Canonical/og:url naturally drop the ?q= (the hook uses the pathname),
  // so search variants collapse onto /items. Indexable.
  const rawQuery = (searchParams.get('q') ?? '').trim()
  useSeo({
    title: rawQuery ? t('seo.collectibles.searchTitle', { query: rawQuery }) : t('seo.collectibles.title'),
    description: t('seo.collectibles.description')
  })

  // EVERY filter lives in the URL, through one owner. A refresh, a shared link and the back button used
  // to keep only Category and Status; the rest was local state and vanished.
  const filterDefaults = useMemo(
    () => ({
      category: 'all',
      status: 'on_sale',
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
  const { subCategory, rarities, priceMin, priceMax, smart, sort } = filterState
  const category = filterState.category
  // Validated on read: the URL is user-editable, and an unknown status must not reach the query.
  const status: FilterStatus = STATUSES.includes(filterState.status as FilterStatus)
    ? (filterState.status as FilterStatus)
    : 'on_sale'
  // A category is a different set of items, not more of the same one — read it from the top.
  useScrollTopOnChange(`${category}:${subCategory ?? ''}`)

  const [filtersOpen, setFiltersOpen] = useState(false) // mobile filters drawer

  // Close the mobile filters drawer on Escape (it already closes on scrim tap / ✕) and lock body
  // scroll while it's open so the page behind the bottom sheet can't scroll (only the sheet does).
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

  // Browse is routed by the Status filter:
  //  • 'on_sale' (DEFAULT) → the item-unified feed (/v3/catalog/unified?groupBy=item) — native + legacy
  //    on-sale liquidity collapsed to ONE card per item (primary-preferred price + listingCount), with
  //    Add-to-cart / Buy-now cards.
  //  • 'all' / 'not_for_sale' → the full catalog (/v3/catalog/items, via fetchCatalogItems) — every
  //    item incl. those not for sale, rendered as VIEW-only cards (no inline trade). 'not_for_sale'
  //    passes isOnSale:false; 'all' leaves it unset (both).
  const isUnified = status === 'on_sale'
  const min = priceMin && !Number.isNaN(Number(priceMin)) ? Number(priceMin) : undefined
  const max = priceMax && !Number.isNaN(Number(priceMax)) ? Number(priceMax) : undefined
  const secondarySales = useSecondarySales()
  const wearableCategories = subCategory ? SUBCAT_MAP[subCategory] : undefined
  const sortBy = (SORTS.find(s => s.key === sort) ?? SORTS[0]).server
  // Item-unified (on-sale) grid filter set — /v3/catalog/unified?groupBy=item does the filtering + sort
  // + search, one card per item.
  const filters = {
    category,
    rarities: rarities.length ? rarities : undefined,
    wearableCategories,
    minPriceCredits: min,
    maxPriceCredits: max,
    search: q || undefined,
    sortBy,
    isSmart: smart || undefined,
    onSale: true,
    // Resales are hidden unless the flag says otherwise. Filtered server-side: this grid is paginated and
    // shows a result count, so dropping rows here would give short pages and a count that lies. Note this
    // also drops SOLD-OUT items whose only remaining stock is a resale — that is the intended behaviour,
    // they are not purchasable in the Shop.
    listingType: secondarySales ? undefined : ('primary' as const)
  }
  // Full-catalog (all / not-for-sale) filter set. Same category/rarity/sub-category/search/sort/smart,
  // minus the credit price-range (see fetchCatalogItems — that endpoint's range is MANA-denominated).
  const catalogFilters = {
    category,
    rarities: rarities.length ? rarities : undefined,
    wearableCategories,
    search: q || undefined,
    sortBy,
    isWearableSmart: smart || undefined,
    isOnSale: status === 'not_for_sale' ? false : undefined
  }

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
  } = useInfiniteGrid<CatalogItem>(
    isUnified ? ['shop-items', filters] : ['catalog-items', catalogFilters],
    skip =>
      isUnified
        ? fetchShopItems({ ...filters, first: PAGE_SIZE, skip })
        : fetchCatalogItems({ ...catalogFilters, first: PAGE_SIZE, skip }),
    // NAMEs isn't a grid category — don't fire a bogus catalog fetch when it's selected.
    { enabled: category !== 'names' }
  )
  const resultCount = total

  // The live market rate powers the legacy cards' fluctuating credit prices. If the oracle is
  // stale/down we still list the items but disable Buy Now with a notice (rather than pricing off a
  // bad rate) — native (fixed-price) cards are unaffected. Mirrors the old Market tab.
  const { data: rate, isError: rateError, isPending: ratePending } = useManaRate()
  const priceOf = (item: UnifiedListing): number | null =>
    rate && item.manaWei ? manaWeiToCredits(item.manaWei, rate) : null

  // A legacy row we cannot price falls into the view-card branch below, and `priceOf` returns null for
  // BOTH reasons it can be unpriceable: the oracle read FAILED, or it is still in flight. Only the first
  // is a real answer. Treating the second as one published a card in a mode the data never justified —
  // a full-width dark VIEW pill that is not part of the on-sale card at all, with no creator line and no
  // chips. It is not a rare race either: on production every unified row is `source: 'legacy'`, and the
  // rate costs three SEQUENTIAL oracle round-trips (see lib/mana-rate) against the item feed's one, so
  // the whole grid renders wrong first and corrects itself. Hold the skeleton for that window instead —
  // an unfinished row is not ready to be a card. An oracle that actually FAILS leaves `isPending` false, so the
  // view-card fallback + banner still take over rather than the grid hanging on a skeleton.
  const ratePendingForLegacy = isUnified && ratePending && items.some(i => (i as UnifiedListing).source === 'legacy')

  // Show skeletons both on the first load (no data yet) and while a NEW filter/search/sort set is
  // in-flight — in that window react-query is still handing us the PREVIOUS results (keepPreviousData),
  // so without this the grid would keep the now-stale cards on screen until the new data lands. On the
  // filter-change case keep the skeleton count equal to the number of cards currently shown so the grid
  // height doesn't jump; on the very first load fall back to a sensible full-ish grid.
  const showGridSkeletons = isLoading || isPlaceholderData || ratePendingForLegacy
  const gridSkeletonCount = isLoading ? 15 : Math.min(Math.max(items.length, 1), PAGE_SIZE)

  // Funnel: fire 'Shop Searched'/'Shop Applied Filter' once per change, AFTER results resolve so
  // result_count is accurate (see design/SHOP_TRACKING_SPEC.md §5.2). Refs dedupe + skip the initial load.
  const lastSearched = useRef<string | null>(null)
  useEffect(() => {
    if (isLoading || isPlaceholderData || !q || lastSearched.current === q) return
    lastSearched.current = q
    track('Shop Searched', { query: q, result_count: resultCount })
  }, [q, isLoading, isPlaceholderData, resultCount])

  const lastFilterSig = useRef<string>('__init__')
  useEffect(() => {
    if (isLoading || isPlaceholderData) return
    const sig = JSON.stringify({ category, subCategory, rarities, min, max, sort, status, smart })
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
        status,
        smart,
        sort
      },
      result_count: resultCount
    })
  }, [category, subCategory, rarities, min, max, sort, status, smart, isLoading, isPlaceholderData, resultCount])

  // Category and the sub-category it invalidates move in ONE write: two separate ones each read the same
  // URL snapshot, and the second silently dropped the first.
  function pickCategory(key: string) {
    setFilters({ category: key, subCategory: null })
  }
  function setStatus(next: FilterStatus) {
    setFilters({ status: next })
  }
  function toggleRarity(r: string) {
    setFilters({ rarities: rarities.includes(r) ? rarities.filter(x => x !== r) : [...rarities, r] })
  }
  // Reset every filter to its default. Filters apply live, so this takes effect immediately.
  function clearFilters() {
    setFilters(filterDefaults)
  }

  // Applied-filter chips (Figma top-bar 1304-310186 / desktop 1256-293193): price, each selected
  // rarity (in canonical order), Smart, and a non-default Status. Each removes just its own filter.
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
  if (status !== 'on_sale')
    chips.push({
      key: 'status',
      label: status === 'all' ? t('filter.statusAll') : t('filter.notForSale'),
      onRemove: () => setStatus('on_sale')
    })

  return (
    <S.Root data-testid="browse">
      {/* NAMEs is a full-width page (Figma 1368-353269) — no filter sidebar; the breadcrumb returns
          to the grid. Every other category shows the collectibles filter sidebar. */}
      {category !== 'names' && (
        <>
          {filtersOpen ? <S.Scrim onClick={() => setFiltersOpen(false)} aria-hidden /> : null}
          <S.Sidebar data-open={filtersOpen || undefined} data-testid="browse-sidebar">
            <S.DrawerHead>
              <S.DrawerTitle>{t('assets.filters')}</S.DrawerTitle>
              <S.CloseBtn onClick={() => setFiltersOpen(false)} aria-label={t('assets.closeFilters')}>
                ✕
              </S.CloseBtn>
            </S.DrawerHead>

            <S.SidebarScroll>
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
              />
            </S.SidebarScroll>

            {/* Bottom action bar (Figma node 1304-308322) — mobile only. Filters apply live, so this
            simply dismisses the sheet. */}
            <S.DrawerFoot>
              <S.ShowItems type="button" onClick={() => setFiltersOpen(false)}>
                {t('assets.showItems')}
              </S.ShowItems>
            </S.DrawerFoot>
          </S.Sidebar>
        </>
      )}

      <S.Main>
        {category === 'names' ? (
          // NAMEs is not a grid: full-width purchase page (no sidebar), back via the breadcrumb.
          <NamesPage onBack={() => pickCategory('all')} />
        ) : (
          <>
            <FilterBar
              sort={sort}
              onSort={v => setFilters({ sort: v })}
              total={total}
              loading={isLoading || isPlaceholderData}
              query={q}
              onOpenFilters={() => setFiltersOpen(true)}
              chips={chips}
              onClearChips={clearFilters}
            />

            {/* Legacy (market-priced) cards follow the live rate; if the oracle is down, Buy Now is paused.
            Only warn when the current results actually contain a market-priced item, so users browsing
            only fixed-price items aren't shown an irrelevant notice. */}
            {rateError && isUnified && items.some(i => (i as UnifiedListing).source === 'legacy') ? (
              <S.MarketBanner data-variant="warn">{t('assets.marketUnavailable')}</S.MarketBanner>
            ) : null}

            {error ? <ErrorNotice message={t('assets.loadError')} testId="browse-error" /> : null}

            {!showGridSkeletons && items.length === 0 && !error ? (
              <S.EmptyState data-testid="browse-empty">
                <S.EmptyIcon src={emptyIllustration} alt="" />
                <S.EmptyText>
                  <S.EmptyTitle>{t('assets.empty.title')}</S.EmptyTitle>
                  <S.EmptyBody>
                    {rawQuery ? (
                      <>
                        {t('assets.empty.searchBefore')}
                        <b>{rawQuery}</b>
                        {t('assets.empty.searchAfter')}
                      </>
                    ) : (
                      t('assets.empty.filters')
                    )}
                  </S.EmptyBody>
                </S.EmptyText>
                <S.EmptyCta>
                  <S.EmptyBtn type="button" onClick={() => navigate('/overview')}>
                    {t('assets.empty.cta')}
                  </S.EmptyBtn>
                </S.EmptyCta>
              </S.EmptyState>
            ) : (
              <>
                <Grid data-testid="grid">
                  {showGridSkeletons ? (
                    <SkeletonCards count={gridSkeletonCount} />
                  ) : (
                    <>
                      {items.map(item => {
                        // View-only grids ('all' / 'not_for_sale'): every card is a VIEW card (no inline trade).
                        if (!isUnified) return <AssetCard key={listingKey(item)} item={item} mode="view" />
                        // On-sale unified grid. Legacy and native rows render IDENTICALLY — same price
                        // treatment, same Add to cart. The split below is only about where the price comes
                        // from, not about offering a different purchase path.
                        const unified = item as UnifiedListing
                        if (unified.source !== 'legacy') return <AssetCard key={listingKey(item)} item={item} />
                        // A legacy row is an ordinary card: same price treatment, same Add to cart. What it
                        // carries is the LIVE-rate price, not the server's snapshot, since that is what
                        // checkout will authorize. With no rate we cannot price it at all — render it as a
                        // view card rather than invite a purchase at a stale number (the banner above
                        // already explains why). By here the oracle has SETTLED: a read still in flight is
                        // held on the skeleton above (see ratePendingForLegacy), so this branch means the
                        // rate genuinely failed and never a row that is merely still loading.
                        const livePrice = priceOf(unified)
                        return livePrice == null ? (
                          <AssetCard key={listingKey(item)} item={item} mode="view" />
                        ) : (
                          <AssetCard key={listingKey(item)} item={{ ...unified, priceCredits: livePrice }} />
                        )
                      })}
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
          </>
        )}
      </S.Main>
    </S.Root>
  )
}
