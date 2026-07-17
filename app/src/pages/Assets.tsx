import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { fetchUnified, type CatalogItem, type LegacyListing, type UnifiedListing } from '~/lib/api'
import { manaWeiToCredits } from '~/lib/mana-rate'
import { useManaRate } from '~/hooks/useManaRate'
import { AssetCard } from '~/components/AssetCard'
import { CategoryFilter } from '~/components/CategoryFilter'
import { FilterBar, RARITIES, SORTS } from '~/components/FilterBar'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { MarketCheckout } from '~/components/MarketCheckout'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { SUBCAT_MAP } from '~/lib/categories'
import { track } from '~/lib/analytics'

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

  const [category, setCategory] = useState('wearable')
  const [subCategory, setSubCategory] = useState<string | null>(null)
  const [rarities, setRarities] = useState<string[]>([])
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [sort, setSort] = useState('newest')
  const [rarityOpen, setRarityOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false) // mobile filters drawer
  const [checkout, setCheckout] = useState<LegacyListing | null>(null)

  // Close the mobile filters drawer on Escape (it already closes on scrim tap / ✕).
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
    <div className="browse browse--sidebar">
      {filtersOpen ? <div className="browse__scrim" onClick={() => setFiltersOpen(false)} aria-hidden /> : null}
      <aside className={`browse__sidebar${filtersOpen ? ' is-open' : ''}`}>
        <div className="browse__sidebar-head">
          <span className="browse__sidebar-title">Filters</span>
          <button className="browse__sidebar-close" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
            ✕
          </button>
        </div>
        <div className="sidebar__section-label">Category</div>
        <CategoryFilter
          category={category}
          subCategory={subCategory}
          onCategory={pickCategory}
          onSub={setSubCategory}
        />

        <div className="sidebar__divider" />

        <div className="sidebar__section-label">Price</div>
        <div className="price-filter">
          <div className="price-filter__inputs">
            <label className="price-filter__field">
              <span className="price-filter__field-label">Min</span>
              <span className="price-filter__box">
                <CurrencyIcon className="price-filter__coin" />
                <input
                  type="number"
                  min="0"
                  aria-label="Minimum price"
                  placeholder="0"
                  value={priceMin}
                  onChange={e => setPriceMin(e.target.value)}
                />
              </span>
            </label>
            <span className="price-filter__to">to</span>
            <label className="price-filter__field">
              <span className="price-filter__field-label">Max</span>
              <span className="price-filter__box">
                <CurrencyIcon className="price-filter__coin" />
                <input
                  type="number"
                  min="0"
                  aria-label="Maximum price"
                  placeholder="0"
                  value={priceMax}
                  onChange={e => setPriceMax(e.target.value)}
                />
              </span>
            </label>
          </div>

          <div
            className="price-filter__slider"
            style={{ '--min-pct': `${minPct}%`, '--max-pct': `${maxPct}%` } as CSSProperties}
          >
            <div className="price-filter__track" aria-hidden />
            <div className="price-filter__fill" aria-hidden />
            <input
              type="range"
              min={0}
              max={PRICE_SLIDER_MAX}
              value={sliderMin}
              aria-label="Minimum price slider"
              onChange={e => onSlideMin(Number(e.target.value))}
            />
            <input
              type="range"
              min={0}
              max={PRICE_SLIDER_MAX}
              value={sliderMax}
              aria-label="Maximum price slider"
              onChange={e => onSlideMax(Number(e.target.value))}
            />
          </div>

          <div className="price-filter__range">
            <span className="price-filter__range-val">
              <CurrencyIcon className="price-filter__coin" />
              {sliderMin.toLocaleString()}
            </span>
            <span className="price-filter__range-val">
              <CurrencyIcon className="price-filter__coin" />
              {sliderMax.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="sidebar__divider" />

        {/* Rarity now lives at the bottom-left of the sidebar (Figma New Shop 2026) instead of a
            top-right pill — a collapsible section over the shared RARITIES multi-select. */}
        <button
          type="button"
          className="sidebar__section-toggle"
          aria-expanded={rarityOpen}
          onClick={() => setRarityOpen(o => !o)}
        >
          <span className="sidebar__section-label">Rarity</span>
          <span className={`ico ico-chevron sidebar__section-chev${rarityOpen ? ' is-up' : ''}`} aria-hidden />
        </button>
        {rarityOpen ? (
          <div className="rarity-filter">
            {RARITIES.map(r => (
              <label key={r} className={`rarity-filter__check${rarities.includes(r) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={rarities.includes(r)} onChange={() => toggleRarity(r)} />
                <span>{r}</span>
              </label>
            ))}
          </div>
        ) : null}

        {/* Drawer action bar (Figma node 1059-158189) — mobile only (CSS). Filters apply live, so
            Apply simply dismisses the drawer; Clear Filters resets them all. */}
        <div className="browse__sidebar-foot">
          <button type="button" className="browse__clear" onClick={clearFilters}>
            Clear Filters
          </button>
          <button type="button" className="browse__apply" onClick={() => setFiltersOpen(false)}>
            Apply
          </button>
        </div>
      </aside>

      <div className="browse__main">
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
          <p className="market-banner market-banner--warn">
            Some market prices are temporarily unavailable — buying those items is paused for a moment. Please try again
            shortly.
          </p>
        ) : null}

        {error ? <p className="error">Couldn&rsquo;t load items — please try again.</p> : null}

        <div className="grid">
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
        </div>

        <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} />

        {!isLoading && items.length === 0 ? <p className="muted">No items match your filters.</p> : null}
      </div>

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
    </div>
  )
}
