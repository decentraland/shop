import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchListings, type ShopSort } from '~/lib/api'
import { AssetCard } from '~/components/AssetCard'
import { CategoryFilter } from '~/components/CategoryFilter'
import { SkeletonCards } from '~/components/SkeletonCards'
import { LoadMore } from '~/components/LoadMore'
import { useInfiniteGrid } from '~/hooks/useInfiniteGrid'
import { CURRENCY } from '~/lib/currency'
import { track } from '~/lib/analytics'

// Items fetched per page (infinite scroll pages by cumulative offset — see useInfiniteGrid).
const PAGE_SIZE = 48

// Sidebar sub-labels → the on-chain categories they cover. Wearable sub-labels map to wearable
// categories; emote sub-labels map to emote categories. Both go out on the same `wearableCategory`
// query param — the server filters on a coalesced wearable/emote category column (see /v3/catalog/shop).
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

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique', 'exotic']

const SORTS: { key: string; label: string; server: ShopSort }[] = [
  { key: 'newest', label: 'Newest', server: 'newest' },
  { key: 'price-asc', label: 'Price: Low to High', server: 'cheapest' },
  { key: 'price-desc', label: 'Price: High to Low', server: 'most_expensive' },
  { key: 'name', label: 'Name (A–Z)', server: 'name' }
]

type OpenPanel = null | 'section' | 'rarity' | 'price' | 'sort'

export function Assets() {
  const [searchParams] = useSearchParams()
  const q = (searchParams.get('q') ?? '').trim().toLowerCase()

  const [category, setCategory] = useState('wearable')
  const [subCategory, setSubCategory] = useState<string | null>(null)
  const [rarities, setRarities] = useState<string[]>([])
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [sort, setSort] = useState('newest')
  const [open, setOpen] = useState<OpenPanel>(null)

  // Build the server filter set — /v3/catalog/shop does the filtering + sort + search.
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
    ['listings', filters],
    skip => fetchListings({ ...filters, first: PAGE_SIZE, skip })
  )
  const resultCount = total

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
    setOpen(null)
  }
  function toggle(panel: OpenPanel) {
    setOpen(o => (o === panel ? null : panel))
  }

  const currentSort = SORTS.find(s => s.key === sort) ?? SORTS[0]
  const priceActive = !!(min || max)
  const priceLabel = priceActive ? `${priceMin || '0'}–${priceMax || '∞'}` : 'Price'
  const anyActive = category !== 'wearable' || !!subCategory || rarities.length > 0 || priceActive

  return (
    <div className="browse browse--sidebar">
      {open ? <div className="filterbar__scrim" onClick={() => setOpen(null)} aria-hidden /> : null}

      <aside className="browse__sidebar">
        <CategoryFilter category={category} subCategory={subCategory} onCategory={pickCategory} onSub={setSubCategory} />
      </aside>

      <div className="browse__main">
      <div className="filterbar">
        <div className="filterbar__filters">
          {/* Rarity */}
          <div className="filterbar__item">
            <button className={`filterbar__trigger${open === 'rarity' ? ' is-open' : ''}${rarities.length ? ' is-active' : ''}`} onClick={() => toggle('rarity')}>
              Rarity {rarities.length ? <span className="filterbar__badge">{rarities.length}</span> : null} <span className={`ico ico-chevron filterbar__chev${open === 'rarity' ? ' is-up' : ''}`} aria-hidden />
            </button>
            {open === 'rarity' ? (
              <div className="filter-pop filter-pop--rarity">
                {RARITIES.map(r => (
                  <label key={r} className="filter-pop__check">
                    <input type="checkbox" checked={rarities.includes(r)} onChange={() => toggleRarity(r)} />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          {/* Price */}
          <div className="filterbar__item">
            <button className={`filterbar__trigger${open === 'price' ? ' is-open' : ''}${priceActive ? ' is-active' : ''}`} onClick={() => toggle('price')}>
              {priceLabel} <span className={`ico ico-chevron filterbar__chev${open === 'price' ? ' is-up' : ''}`} aria-hidden />
            </button>
            {open === 'price' ? (
              <div className="filter-pop filter-pop--price">
                <div className="filter-pop__price-row">
                  <input type="number" min="0" aria-label="Minimum price" placeholder="Min" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
                  <span>–</span>
                  <input type="number" min="0" aria-label="Maximum price" placeholder="Max" value={priceMax} onChange={e => setPriceMax(e.target.value)} />
                </div>
                <p className="filter-pop__hint">Price in {CURRENCY.name}</p>
              </div>
            ) : null}
          </div>

          {anyActive ? <button className="filterbar__clear" onClick={reset}>Clear all</button> : null}
        </div>

        <div className="filterbar__right">
          <span className="filterbar__count">
            {isLoading ? '…' : `${total.toLocaleString()} item${total === 1 ? '' : 's'}`}
            {q ? ` for “${q}”` : ''}
          </span>
          <div className="filterbar__item">
            <button className={`filterbar__sort${open === 'sort' ? ' is-open' : ''}`} onClick={() => toggle('sort')}>
              Sort by: {currentSort.label} <span className={`ico ico-chevron filterbar__chev${open === 'sort' ? ' is-up' : ''}`} aria-hidden />
            </button>
            {open === 'sort' ? (
              <div className="filter-pop filter-pop--sort">
                {SORTS.map(s => (
                  <button
                    key={s.key}
                    className={`filter-pop__sort${s.key === sort ? ' is-active' : ''}`}
                    onClick={() => { setSort(s.key); setOpen(null) }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <p className="error">{error.message}</p> : null}

      <div className="grid">
        {isLoading ? (
          <SkeletonCards count={15} />
        ) : (
          <>
            {items.map(item => <AssetCard key={item.id} item={item} />)}
            {isFetchingNextPage ? <SkeletonCards count={6} /> : null}
          </>
        )}
      </div>

      <LoadMore hasNextPage={hasNextPage} isFetching={isFetchingNextPage} onLoadMore={() => fetchNextPage()} />

      {!isLoading && items.length === 0 ? (
        <p className="muted">No items match your filters.</p>
      ) : null}
      </div>
    </div>
  )
}
