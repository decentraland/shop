import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { fetchLegacyListings, type LegacyListing, type CatalogItem } from '~/lib/api'
import { manaWeiToCredits } from '~/lib/mana-rate'
import { useManaRate } from '~/hooks/useManaRate'
import { AssetCard } from '~/components/AssetCard'
import { FilterBar, FilterPanel, SORTS } from '~/components/FilterBar'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { MarketCheckout } from '~/components/MarketCheckout'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'

const PAGE_SIZE = 48

// Mirrors Assets.tsx — the same horizontal filter bar + grid. The differences are all "market":
// it reads /v3/catalog/legacy (classic MANA-priced liquidity), shows FLUCTUATING credit prices, and
// each card buys via Buy now (direct checkout), never the cart.

const CATEGORIES = [
  { key: 'wearable', label: 'Wearables', sub: ['Head', 'Upper Body', 'Handwear', 'Lower Body', 'Feet', 'Accessories', 'Skins'] },
  { key: 'emote', label: 'Emotes', sub: [] }
]

const SUBCAT_MAP: Record<string, string[]> = {
  Head: ['head', 'hat', 'hair', 'facial_hair', 'eyes', 'eyebrows', 'mouth', 'mask', 'helmet', 'tiara', 'top_head'],
  'Upper Body': ['upper_body'],
  Handwear: ['hands_wear'],
  'Lower Body': ['lower_body'],
  Feet: ['feet'],
  Accessories: ['earring', 'eyewear'],
  Skins: ['skin']
}

// A legacy listing rendered through AssetCard: the card only reads contractAddress/itemId (preview),
// name, creator, rarity, category and thumbnail — so a light projection is enough.
function toCardItem(l: LegacyListing): CatalogItem {
  return {
    id: l.tradeId,
    tradeId: l.tradeId,
    name: l.name,
    creator: l.creator,
    contractAddress: l.contractAddress,
    itemId: l.itemId,
    category: l.category,
    wearableCategory: l.wearableCategory ?? undefined,
    rarity: l.rarity,
    network: l.network,
    chainId: l.chainId,
    thumbnail: l.thumbnail,
    priceCredits: 0,
    gender: null
  }
}

export function Market() {
  const [searchParams] = useSearchParams()
  const q = (searchParams.get('q') ?? '').trim().toLowerCase()
  const qc = useQueryClient()

  const [category, setCategory] = useState('wearable')
  const [subCategory, setSubCategory] = useState<string | null>(null)
  const [rarities, setRarities] = useState<string[]>([])
  const [sort, setSort] = useState('newest')
  const [checkout, setCheckout] = useState<LegacyListing | null>(null)

  const wearableCategories = subCategory ? SUBCAT_MAP[subCategory] : undefined
  const sortBy = (SORTS.find(s => s.key === sort) ?? SORTS[0]).server
  const filters = {
    category,
    rarities: rarities.length ? rarities : undefined,
    wearableCategories,
    search: q || undefined,
    sortBy
  }

  const {
    items: listings,
    total,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage
  } = useInfiniteGrid(['legacy-listings', filters], skip => fetchLegacyListings({ ...filters, first: PAGE_SIZE, skip }))

  // The live market rate powers the fluctuating credit prices. If the oracle is stale/down we still
  // list the items but disable Buy now with a notice (rather than pricing off a bad rate).
  const { data: rate, isError: rateError } = useManaRate()
  const priceOf = (l: LegacyListing): number | null => (rate ? manaWeiToCredits(l.manaWei, rate) : null)

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
  }
  function openCheckout(item: CatalogItem) {
    const listing = listings.find(l => l.tradeId === item.tradeId)
    if (listing) setCheckout(listing)
  }
  function refreshMarket() {
    void qc.invalidateQueries({ queryKey: ['legacy-listings'] })
  }

  const currentCat = CATEGORIES.find(c => c.key === category) ?? CATEGORIES[0]
  const sectionLabel = subCategory ? `${currentCat.label} · ${subCategory}` : currentCat.label
  const anyActive = category !== 'wearable' || !!subCategory || rarities.length > 0

  return (
    <div className="browse">
      {/* Web2-friendly notice: prices here follow the live market — never any crypto/MANA jargon. */}
      <div className="market-banner">
        <span className="market-banner__ico" aria-hidden>✨</span>
        <span>Prices here follow the live market and may shift slightly at checkout.</span>
      </div>

      {rateError ? (
        <p className="market-banner market-banner--warn">
          The market price is temporarily unavailable — buying is paused for a moment. Please try again shortly.
        </p>
      ) : null}

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
        renderLeading={panel => (
          <FilterPanel
            panelKey="section"
            label={sectionLabel}
            active={!!subCategory || category !== 'wearable'}
            panel={panel}
          >
            <div className="filter-pop filter-pop--section">
              <ul className="filter-pop__cats">
                {CATEGORIES.map(c => (
                  <li key={c.key}>
                    <button className={`filter-pop__cat${category === c.key ? ' is-active' : ''}`} onClick={() => pickCategory(c.key)}>
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
              {currentCat.sub.length ? (
                <ul className="filter-pop__subs">
                  <li>
                    <button className={`filter-pop__sub${!subCategory ? ' is-active' : ''}`} onClick={() => { setSubCategory(null); panel.close() }}>
                      All {currentCat.label}
                    </button>
                  </li>
                  {currentCat.sub.map(s => (
                    <li key={s}>
                      <button className={`filter-pop__sub${subCategory === s ? ' is-active' : ''}`} onClick={() => { setSubCategory(prev => (prev === s ? null : s)); panel.close() }}>
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </FilterPanel>
        )}
      />

      {error ? <p className="error">Couldn&rsquo;t load the market — please try again.</p> : null}

      <div className="grid">
        {isLoading ? (
          <SkeletonCards count={15} />
        ) : (
          <>
            {listings.map(l => (
              <AssetCard
                key={l.tradeId}
                item={toCardItem(l)}
                mode="market"
                marketPriceCredits={priceOf(l)}
                onBuyNow={openCheckout}
              />
            ))}
            {isFetchingNextPage ? <SkeletonCards count={6} /> : null}
          </>
        )}
      </div>

      <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => fetchNextPage()} />

      {!isLoading && listings.length === 0 ? (
        <p className="muted">No items match your filters.</p>
      ) : null}

      {checkout && rate ? (
        <MarketCheckout
          listing={checkout}
          rate={rate}
          onClose={() => setCheckout(null)}
          onSold={() => { setCheckout(null); refreshMarket() }}
        />
      ) : null}
    </div>
  )
}

export default Market
