import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { fetchUnified, type CatalogItem, type LegacyListing, type UnifiedListing } from '~/lib/api'
import { manaWeiToCredits } from '~/lib/mana-rate'
import { useManaRate } from '~/hooks/useManaRate'
import { AssetCard } from '~/components/AssetCard'
import { CategoryFilter } from '~/components/CategoryFilter'
import { FilterBar, FilterPanel, SORTS } from '~/components/FilterBar'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { MarketCheckout } from '~/components/MarketCheckout'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { CURRENCY } from '~/lib/currency'
import { track } from '~/lib/analytics'

// Items fetched per page (infinite scroll pages by cumulative offset — see useInfiniteGrid).
const PAGE_SIZE = 48

// Sidebar sub-labels → the on-chain categories they cover. Wearable sub-labels map to wearable
// categories; emote sub-labels map to emote categories. Both go out on the same `wearableCategory`
// query param — the server filters on a coalesced wearable/emote category column (see /v3/catalog/unified).
const SUBCAT_MAP: Record<string, string[]> = {
  Head: ['head', 'hat', 'hair', 'facial_hair', 'eyes', 'eyebrows', 'mouth', 'mask', 'helmet', 'tiara', 'top_head'],
  'Upper Body': ['upper_body'],
  Handwear: ['hands_wear'],
  'Lower Body': ['lower_body'],
  Feet: ['feet'],
  Accessories: ['earring', 'eyewear'],
  Skins: ['skin'],
  Dance: ['dance'],
  Stunt: ['stunt'],
  Greetings: ['greetings'],
  Fun: ['fun'],
  Poses: ['poses'],
  Reactions: ['reactions'],
  Horror: ['horror'],
  Miscellaneous: ['miscellaneous']
}

// A legacy row from the unified feed → the LegacyListing shape MarketCheckout (Buy Now) expects. The
// unified item is a superset of CatalogItem carrying `manaWei` (present for legacy), so the projection
// is light — `available`/`createdAt` aren't used by the checkout money flow.
function toLegacyListing(item: UnifiedListing): LegacyListing {
  return {
    tradeId: item.tradeId ?? item.id,
    listingType: 'primary',
    contractAddress: item.contractAddress,
    itemId: item.itemId ?? '',
    name: item.name,
    thumbnail: item.thumbnail,
    rarity: item.rarity,
    category: item.category,
    wearableCategory: item.wearableCategory ?? null,
    creator: item.creator,
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
  const [checkout, setCheckout] = useState<LegacyListing | null>(null)

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
  function reset() {
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

        {/* Legacy (market-priced) cards follow the live rate; if the oracle is down, Buy Now is paused.
            Only warn when the current results actually contain a market-priced item, so users browsing
            only fixed-price items aren't shown an irrelevant notice. */}
        {rateError && items.some(i => i.source === 'legacy') ? (
          <p className="market-banner market-banner--warn">
            Some market prices are temporarily unavailable — buying those items is paused for a moment. Please try again shortly.
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

        <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => fetchNextPage()} />

        {!isLoading && items.length === 0 ? (
          <p className="muted">No items match your filters.</p>
        ) : null}
      </div>

      {checkout && rate ? (
        <MarketCheckout
          listing={checkout}
          rate={rate}
          onClose={() => setCheckout(null)}
          onSold={() => { setCheckout(null); refreshGrid() }}
        />
      ) : null}
    </div>
  )
}
