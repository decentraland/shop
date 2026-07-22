import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { fetchUnified, type CatalogItem, type LegacyListing, type UnifiedListing } from '~/lib/api'
import { fetchCatalogItems } from '~/lib/collections'
import { manaWeiToCredits } from '~/lib/mana-rate'
import { useManaRate } from '~/hooks/useManaRate'
import { AssetCard } from '~/components/AssetCard'
import { Filters, type FilterStatus } from '~/components/Filters'
import { FilterBar, type FilterChip, RARITIES, SORTS } from '~/components/FilterBar'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { MarketCheckout } from '~/components/MarketCheckout'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { useSeo } from '~/hooks/useSeo'
import { SUBCAT_MAP } from '~/lib/categories'
import { capitalizeFirst } from '~/lib/text'
import { track } from '~/lib/analytics'
import { t } from '~/intl/i18n'
import { ErrorNotice } from '~/components/ErrorNotice'
import { NamesPage } from '~/pages/NamesPage'
import * as S from './Assets.styles'

// Items fetched per page (infinite scroll pages by cumulative offset — see useInfiniteGrid).
const PAGE_SIZE = 48

// A legacy row from the unified feed → the LegacyListing shape MarketCheckout (Buy Now) expects. The
// unified item is a superset of CatalogItem carrying `manaWei` (present for legacy), so the projection
// is light — `available`/`createdAt` aren't used by the checkout money flow.
function toLegacyListing(item: UnifiedListing): LegacyListing {
  return {
    tradeId: item.tradeId ?? item.id,
    // Legacy items in the unified feed are always primary listings (the feed's legacy branch is
    // primary-only), so this is accurate, not a placeholder.
    listingType: 'primary',
    contractAddress: item.contractAddress,
    itemId: item.itemId ?? '',
    name: item.name,
    thumbnail: item.thumbnail,
    rarity: item.rarity,
    category: item.category,
    wearableCategory: item.wearableCategory ?? null,
    creator: item.creator,
    // openCheckout only calls this for a legacy item with a truthy manaWei, so the `'0'` fallback is
    // never really hit — it just satisfies the string type (and MarketCheckout rejects usdCents <= 0).
    manaWei: item.manaWei ?? '0',
    available: 1,
    network: item.network,
    chainId: item.chainId,
    createdAt: 0
  }
}

export function Assets() {
  const [searchParams] = useSearchParams()
  const q = (searchParams.get('q') ?? '').trim().toLowerCase()
  const qc = useQueryClient()

  // Collectibles grid SEO. Fold the (case-preserved) search term into the title when present; the
  // description stays generic. Canonical/og:url naturally drop the ?q= (the hook uses the pathname),
  // so search variants collapse onto /assets. Indexable.
  const rawQuery = (searchParams.get('q') ?? '').trim()
  useSeo({
    title: rawQuery ? t('seo.collectibles.searchTitle', { query: rawQuery }) : t('seo.collectibles.title'),
    description: t('seo.collectibles.description')
  })

  const [category, setCategory] = useState('wearable')
  const [subCategory, setSubCategory] = useState<string | null>(null)
  const [rarities, setRarities] = useState<string[]>([])
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [status, setStatus] = useState<FilterStatus>('on_sale')
  const [smart, setSmart] = useState(false)
  const [sort, setSort] = useState('newest')
  const [filtersOpen, setFiltersOpen] = useState(false) // mobile filters drawer
  const [checkout, setCheckout] = useState<LegacyListing | null>(null)

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
  //  • 'on_sale' (DEFAULT) → the fast unified MV (/v3/catalog/unified) — native + legacy on-sale
  //    liquidity, with Add-to-cart / Buy-now cards.
  //  • 'all' / 'not_for_sale' → the full catalog (/v3/catalog/items, via fetchCatalogItems) — every
  //    item incl. those not for sale, rendered as VIEW-only cards (no inline trade). 'not_for_sale'
  //    passes isOnSale:false; 'all' leaves it unset (both).
  const isUnified = status === 'on_sale'
  const min = priceMin && !Number.isNaN(Number(priceMin)) ? Number(priceMin) : undefined
  const max = priceMax && !Number.isNaN(Number(priceMax)) ? Number(priceMax) : undefined
  const wearableCategories = subCategory ? SUBCAT_MAP[subCategory] : undefined
  const sortBy = (SORTS.find(s => s.key === sort) ?? SORTS[0]).server
  // Unified (on-sale) grid filter set — /v3/catalog/unified does the filtering + sort + search.
  const filters = {
    category,
    rarities: rarities.length ? rarities : undefined,
    wearableCategories,
    minPriceCredits: min,
    maxPriceCredits: max,
    search: q || undefined,
    sortBy,
    isSmart: smart || undefined,
    onSale: true
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

  const { items, total, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteGrid<CatalogItem>(
      isUnified ? ['unified-listings', filters] : ['catalog-items', catalogFilters],
      skip =>
        isUnified
          ? fetchUnified({ ...filters, first: PAGE_SIZE, skip })
          : fetchCatalogItems({ ...catalogFilters, first: PAGE_SIZE, skip }),
      // NAMEs isn't a grid category — don't fire a bogus catalog fetch when it's selected.
      { enabled: category !== 'names' }
    )
  const resultCount = total

  // The live market rate powers the legacy cards' fluctuating "≈" credit prices. If the oracle is
  // stale/down we still list the items but disable Buy Now with a notice (rather than pricing off a
  // bad rate) — native (fixed-price) cards are unaffected. Mirrors the old Market tab.
  const { data: rate, isError: rateError } = useManaRate()
  const priceOf = (item: UnifiedListing): number | null =>
    rate && item.manaWei ? manaWeiToCredits(item.manaWei, rate) : null

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
  }, [category, subCategory, rarities, min, max, sort, status, smart, isLoading, resultCount])

  function pickCategory(key: string) {
    setCategory(key)
    setSubCategory(null)
  }
  function toggleRarity(r: string) {
    setRarities(rs => (rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r]))
  }
  // Reset every filter to its default. Filters apply live, so this takes effect immediately.
  function clearFilters() {
    setCategory('wearable')
    setSubCategory(null)
    setRarities([])
    setPriceMin('')
    setPriceMax('')
    setStatus('on_sale')
    setSmart(false)
  }
  function openCheckout(card: CatalogItem) {
    const item = items.find(i => i.id === card.id) as UnifiedListing | undefined
    if (item && item.source === 'legacy' && item.manaWei) setCheckout(toLegacyListing(item))
  }
  function refreshGrid() {
    void qc.invalidateQueries({ queryKey: ['unified-listings'] })
  }

  // Applied-filter chips (Figma top-bar 1304-310186 / desktop 1256-293193): price, each selected
  // rarity (in canonical order), Smart, and a non-default Status. Each removes just its own filter.
  const chips: FilterChip[] = []
  if (min != null || max != null)
    chips.push({
      key: 'price',
      label: t('filter.price'),
      onRemove: () => {
        setPriceMin('')
        setPriceMax('')
      }
    })
  for (const r of RARITIES)
    if (rarities.includes(r))
      chips.push({ key: `rarity-${r}`, label: capitalizeFirst(r), onRemove: () => toggleRarity(r) })
  if (smart) chips.push({ key: 'smart', label: t('filter.smart'), onRemove: () => setSmart(false) })
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
          <S.Sidebar className={filtersOpen ? 'is-open' : ''} data-testid="browse-sidebar">
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
                onSub={setSubCategory}
                priceMin={priceMin}
                priceMax={priceMax}
                onPriceMin={setPriceMin}
                onPriceMax={setPriceMax}
                rarities={rarities}
                onToggleRarity={toggleRarity}
                status={status}
                onStatus={setStatus}
                smart={smart}
                onSmart={setSmart}
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
          <NamesPage onBack={() => pickCategory('wearable')} />
        ) : (
          <>
            <FilterBar
              sort={sort}
              onSort={setSort}
              total={total}
              loading={isLoading}
              query={q}
              onOpenFilters={() => setFiltersOpen(true)}
              chips={chips}
              onClearChips={clearFilters}
            />

            {/* Legacy (market-priced) cards follow the live rate; if the oracle is down, Buy Now is paused.
            Only warn when the current results actually contain a market-priced item, so users browsing
            only fixed-price items aren't shown an irrelevant notice. */}
            {rateError && isUnified && items.some(i => (i as UnifiedListing).source === 'legacy') ? (
              <p className="market-banner market-banner--warn">{t('assets.marketUnavailable')}</p>
            ) : null}

            {error ? <ErrorNotice message={t('assets.loadError')} testId="browse-error" /> : null}

            <div className="grid" data-testid="grid">
              {isLoading ? (
                <SkeletonCards count={15} />
              ) : (
                <>
                  {items.map(item => {
                    // View-only grids ('all' / 'not_for_sale'): every card is a VIEW card (no inline trade).
                    if (!isUnified) return <AssetCard key={item.id} item={item} mode="view" />
                    // On-sale unified grid: legacy rows → market (≈ + Buy now), native → Add-to-cart.
                    const unified = item as UnifiedListing
                    return unified.source === 'legacy' ? (
                      <AssetCard
                        key={item.id}
                        item={unified}
                        mode="market"
                        marketPriceCredits={priceOf(unified)}
                        onBuyNow={openCheckout}
                      />
                    ) : (
                      <AssetCard key={item.id} item={item} />
                    )
                  })}
                  {isFetchingNextPage ? <SkeletonCards count={6} /> : null}
                </>
              )}
            </div>

            <LoadMore
              hasNextPage={hasNextPage}
              isFetching={isFetchingNextPage}
              onLoadMore={() => void fetchNextPage()}
            />

            {!isLoading && items.length === 0 ? <p className="muted">{t('assets.noItems')}</p> : null}
          </>
        )}
      </S.Main>

      {checkout && rate ? (
        <MarketCheckout
          listing={checkout}
          rate={rate}
          onClose={() => setCheckout(null)}
          onSold={() => {
            setCheckout(null)
            refreshGrid()
          }}
        />
      ) : null}
    </S.Root>
  )
}
