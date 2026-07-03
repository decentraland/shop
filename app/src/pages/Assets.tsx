import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchListings, type ShopSort } from '~/lib/api'
import { AssetCard } from '~/components/AssetCard'

const CATEGORIES = [
  { key: 'wearable', label: 'Wearables', sub: ['Head', 'Upper Body', 'Handwear', 'Lower Body', 'Feet', 'Accessories', 'Skins'] },
  { key: 'emote', label: 'Emotes', sub: [] },
  { key: 'ens', label: 'NAMEs', sub: [] },
  { key: 'parcel', label: 'Lands', sub: [] }
]

// Sidebar sub-labels → the on-chain wearable categories they cover.
const SUBCAT_MAP: Record<string, string[]> = {
  Head: ['head', 'hat', 'hair', 'facial_hair', 'eyes', 'eyebrows', 'mouth', 'mask', 'helmet', 'tiara', 'top_head'],
  'Upper Body': ['upper_body'],
  Handwear: ['hands_wear'],
  'Lower Body': ['lower_body'],
  Feet: ['feet'],
  Accessories: ['earring', 'eyewear'],
  Skins: ['skin']
}

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique', 'exotic']

const SORTS: { key: string; label: string; server: ShopSort }[] = [
  { key: 'newest', label: 'Newest', server: 'newest' },
  { key: 'price-asc', label: 'Price: Low to High', server: 'cheapest' },
  { key: 'price-desc', label: 'Price: High to Low', server: 'most_expensive' },
  { key: 'name', label: 'Name (A–Z)', server: 'name' }
]

export function Assets() {
  const [searchParams] = useSearchParams()
  const q = (searchParams.get('q') ?? '').trim().toLowerCase()

  const [category, setCategory] = useState('wearable')
  const [subCategory, setSubCategory] = useState<string | null>(null)
  const [rarities, setRarities] = useState<string[]>([])
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [sort, setSort] = useState('newest')
  const [sortOpen, setSortOpen] = useState(false)

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
    sortBy,
    first: 200
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['listings', filters],
    queryFn: () => fetchListings(filters),
    placeholderData: keepPreviousData
  })

  const items = data?.items ?? []

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

  const currentSort = SORTS.find(s => s.key === sort) ?? SORTS[0]

  return (
    <div className="assets">
      <aside className="filters">
        <div className="filters__panel">
          <button className="filters__all" onClick={reset}>Shop All</button>
          {CATEGORIES.map(c => (
            <div className="filters__group" key={c.key}>
              <button
                className={`filters__group-head${category === c.key ? ' is-active' : ''}`}
                onClick={() => pickCategory(c.key)}
              >
                {c.label}
                <span className="filters__chev" aria-hidden>▾</span>
              </button>
              {category === c.key && c.sub.length ? (
                <ul className="filters__sub">
                  {c.sub.map(s => (
                    <li key={s}>
                      <button
                        className={`filters__sub-item${subCategory === s ? ' is-active' : ''}`}
                        onClick={() => setSubCategory(prev => (prev === s ? null : s))}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>

        <div className="filters__panel">
          <div className="filters__panel-title">Rarity</div>
          <div className="filters__rarities">
            {RARITIES.map(r => (
              <button
                key={r}
                className={`rarity-pill${rarities.includes(r) ? ' is-on' : ''}`}
                onClick={() => toggleRarity(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="filters__panel">
          <div className="filters__panel-title">Price (credits)</div>
          <div className="filters__price-inputs">
            <input type="number" min="0" placeholder="Min" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
            <span>–</span>
            <input type="number" min="0" placeholder="Max" value={priceMax} onChange={e => setPriceMax(e.target.value)} />
          </div>
        </div>

        <div className="filters__credits" title="Every item in the Shop is buyable with credits">
          <span>✦ Get With Credits</span>
          <span className="toggle is-on" aria-hidden />
        </div>
      </aside>

      <div className="assets__main">
        <div className="assets__bar">
          <span className="assets__count">
            {isLoading ? '…' : `${items.length.toLocaleString()} Item${items.length === 1 ? '' : 's'}`}
            {q ? ` for “${q}”` : ''}
          </span>
          <div className="sortby-wrap">
            <button className="sortby" onClick={() => setSortOpen(o => !o)}>
              Sort by: {currentSort.label} ▾
            </button>
            {sortOpen ? (
              <div className="sortby-menu">
                {SORTS.map(s => (
                  <button
                    key={s.key}
                    className={s.key === sort ? 'is-active' : ''}
                    onClick={() => {
                      setSort(s.key)
                      setSortOpen(false)
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {error ? <p className="error">{(error as Error).message}</p> : null}

        <div className="grid">
          {isLoading
            ? Array.from({ length: 15 }).map((_, i) => <div className="card card--skeleton" key={i} />)
            : items.map(item => <AssetCard key={item.id} item={item} />)}
        </div>

        {!isLoading && items.length === 0 ? (
          <p className="muted">No items match your filters.</p>
        ) : null}
      </div>
    </div>
  )
}
