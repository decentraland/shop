import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Chevron } from '~/components/Chevron'
import { fetchUnified, type CatalogItem, type LegacyListing, type UnifiedListing } from '~/lib/api'
import { manaWeiToCredits } from '~/lib/mana-rate'
import { useManaRate } from '~/hooks/useManaRate'
import { AssetCard } from '~/components/AssetCard'
import { CategoryFilter } from '~/components/CategoryFilter'
import { FilterBar, RARITIES, SORTS } from '~/components/FilterBar'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { MarketCheckout } from '~/components/MarketCheckout'
import * as S from './Assets.styles'
import { Icon } from '~/components/Icon'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { useSeo } from '~/hooks/useSeo'
import { SUBCAT_MAP } from '~/lib/categories'
import { track } from '~/lib/analytics'
import { t } from '~/intl/i18n'
import { ErrorNotice } from '~/components/ErrorNotice'
import { Grid } from '~/styles/grid.styles'

// Items fetched per page (infinite scroll pages by cumulative offset — see useInfiniteGrid).
const PAGE_SIZE = 48

// Upper bound for the sidebar price range slider (in credits). The Min/Max text inputs stay free-form
// (an exact price above this is still typable); the slider is the coarse control, so the bound is a
// UX choice — comfortably above typical listing prices — NOT the placeholder Figma showed (4,000,000),
// which would make each pixel worth thousands of credits and the slider useless.
const PRICE_SLIDER_MAX = 100_000

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
  const [sort, setSort] = useState('newest')
  const [rarityOpen, setRarityOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false) // mobile filters drawer
  const [checkout, setCheckout] = useState<LegacyListing | null>(null)

  // Close the mobile filters drawer on Escape (it already closes on scrim tap / close button).
  useEffect(() => {
    if (!filtersOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltersOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filtersOpen])

  // Build the server filter set — /v3/catalog/unified does the filtering + sort + search.
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
    ['unified-listings', filters],
    skip => fetchUnified({ ...filters, first: PAGE_SIZE, skip })
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
  // Reset every filter to its default (Figma drawer "Clear Filters"). Filters apply live, so this
  // takes effect immediately; the drawer's "Apply" just closes it.
  function clearFilters() {
    setCategory('wearable')
    setSubCategory(null)
    setRarities([])
    setPriceMin('')
    setPriceMax('')
  }
  function openCheckout(card: CatalogItem) {
    const item = items.find(i => i.id === card.id)
    if (item && item.source === 'legacy' && item.manaWei) setCheckout(toLegacyListing(item))
  }
  function refreshGrid() {
    void qc.invalidateQueries({ queryKey: ['unified-listings'] })
  }

  // Dual-handle price range slider (sidebar). The two overlaid range inputs drive the SAME priceMin/
  // priceMax state as the text inputs, so typing and dragging stay in sync. Values are clamped so the
  // handles can't cross; an empty bound means "unbounded" (min → 0 shown, max → the slider ceiling).
  const sliderMin = min != null ? Math.min(min, PRICE_SLIDER_MAX) : 0
  const sliderMax = max != null ? Math.min(max, PRICE_SLIDER_MAX) : PRICE_SLIDER_MAX
  const minPct = (sliderMin / PRICE_SLIDER_MAX) * 100
  const maxPct = (sliderMax / PRICE_SLIDER_MAX) * 100
  function onSlideMin(v: number) {
    const n = Math.min(v, sliderMax)
    setPriceMin(n <= 0 ? '' : String(n))
  }
  function onSlideMax(v: number) {
    const n = Math.max(v, sliderMin)
    setPriceMax(n >= PRICE_SLIDER_MAX ? '' : String(n))
  }

  return (
    <S.Browse data-testid="browse">
      {filtersOpen ? <S.Scrim onClick={() => setFiltersOpen(false)} aria-hidden /> : null}
      <S.Sidebar data-open={filtersOpen || undefined} data-testid="browse-sidebar">
        <S.SidebarHead>
          <S.SidebarTitle>{t('assets.filters')}</S.SidebarTitle>
          <S.SidebarClose onClick={() => setFiltersOpen(false)} aria-label={t('assets.closeFilters')}>
            <Icon name="close" size={16} />
          </S.SidebarClose>
        </S.SidebarHead>
        <S.SectionLabel>{t('assets.category')}</S.SectionLabel>
        <CategoryFilter
          category={category}
          subCategory={subCategory}
          onCategory={pickCategory}
          onSub={setSubCategory}
        />

        <S.Divider />

        <S.SectionLabel>{t('filter.price')}</S.SectionLabel>
        <S.PriceFilter>
          <S.PriceInputs>
            <S.PriceField>
              <S.PriceFieldLabel>{t('assets.min')}</S.PriceFieldLabel>
              <S.PriceBox>
                <S.PriceCoin />
                <input
                  type="number"
                  min="0"
                  aria-label={t('assets.minPriceAria')}
                  placeholder="0"
                  value={priceMin}
                  onChange={e => setPriceMin(e.target.value)}
                />
              </S.PriceBox>
            </S.PriceField>
            <S.PriceTo>{t('assets.priceTo')}</S.PriceTo>
            <S.PriceField>
              <S.PriceFieldLabel>{t('assets.max')}</S.PriceFieldLabel>
              <S.PriceBox>
                <S.PriceCoin />
                <input
                  type="number"
                  min="0"
                  aria-label={t('assets.maxPriceAria')}
                  placeholder="0"
                  value={priceMax}
                  onChange={e => setPriceMax(e.target.value)}
                />
              </S.PriceBox>
            </S.PriceField>
          </S.PriceInputs>

          <S.PriceSlider style={{ '--min-pct': `${minPct}%`, '--max-pct': `${maxPct}%` } as CSSProperties}>
            <S.PriceTrack aria-hidden />
            <S.PriceFill aria-hidden />
            <input
              type="range"
              min={0}
              max={PRICE_SLIDER_MAX}
              value={sliderMin}
              aria-label={t('assets.minPriceSliderAria')}
              onChange={e => onSlideMin(Number(e.target.value))}
            />
            <input
              type="range"
              min={0}
              max={PRICE_SLIDER_MAX}
              value={sliderMax}
              aria-label={t('assets.maxPriceSliderAria')}
              onChange={e => onSlideMax(Number(e.target.value))}
            />
          </S.PriceSlider>

          <S.PriceRange>
            <S.PriceRangeVal>
              <S.PriceCoin />
              {sliderMin.toLocaleString()}
            </S.PriceRangeVal>
            <S.PriceRangeVal>
              <S.PriceCoin />
              {sliderMax.toLocaleString()}
            </S.PriceRangeVal>
          </S.PriceRange>
        </S.PriceFilter>

        <S.Divider />

        {/* Rarity now lives at the bottom-left of the sidebar (Figma New Shop 2026) instead of a
            top-right pill — a collapsible section over the shared RARITIES multi-select. */}
        <S.SectionToggle
          type="button"
          data-testid="sidebar-section-toggle"
          aria-expanded={rarityOpen}
          onClick={() => setRarityOpen(o => !o)}
        >
          <S.SectionLabel as="span" data-section-label>
            {t('assets.rarity')}
          </S.SectionLabel>
          <Chevron up={rarityOpen} size={20} color="var(--muted)" />
        </S.SectionToggle>
        {rarityOpen ? (
          <S.RarityFilter data-testid="rarity-filter">
            {RARITIES.map(r => (
              <S.RarityCheck key={r} data-on={rarities.includes(r) || undefined} data-testid="rarity-filter-check">
                <input type="checkbox" checked={rarities.includes(r)} onChange={() => toggleRarity(r)} />
                <span>{r}</span>
              </S.RarityCheck>
            ))}
          </S.RarityFilter>
        ) : null}

        {/* Drawer action bar (Figma node 1059-158189) — mobile only (CSS). Filters apply live, so
            Apply simply dismisses the drawer; Clear Filters resets them all. */}
        <S.SidebarFoot>
          <S.Clear type="button" onClick={clearFilters}>
            {t('assets.clearFilters')}
          </S.Clear>
          <S.Apply type="button" onClick={() => setFiltersOpen(false)}>
            {t('assets.apply')}
          </S.Apply>
        </S.SidebarFoot>
      </S.Sidebar>

      <S.Main>
        <FilterBar
          sort={sort}
          onSort={setSort}
          total={total}
          loading={isLoading}
          query={q}
          onOpenFilters={() => setFiltersOpen(true)}
        />

        {/* Legacy (market-priced) cards follow the live rate; if the oracle is down, Buy Now is paused.
            Only warn when the current results actually contain a market-priced item, so users browsing
            only fixed-price items aren't shown an irrelevant notice. */}
        {rateError && items.some(i => i.source === 'legacy') ? (
          <S.MarketBanner data-variant="warn">{t('assets.marketUnavailable')}</S.MarketBanner>
        ) : null}

        {error ? <ErrorNotice message={t('assets.loadError')} testId="browse-error" /> : null}

        <Grid data-testid="grid">
          {isLoading ? (
            <SkeletonCards count={15} />
          ) : (
            <>
              {items.map(item =>
                item.source === 'legacy' ? (
                  <AssetCard
                    key={item.id}
                    item={item}
                    mode="market"
                    marketPriceCredits={priceOf(item)}
                    onBuyNow={openCheckout}
                  />
                ) : (
                  <AssetCard key={item.id} item={item} />
                )
              )}
              {isFetchingNextPage ? <SkeletonCards count={6} /> : null}
            </>
          )}
        </Grid>

        <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} />

        {!isLoading && items.length === 0 ? <p className="muted">{t('assets.noItems')}</p> : null}
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
    </S.Browse>
  )
}
