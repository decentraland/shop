import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchListings, type ShopSort } from '~/lib/api'
import { AssetCard } from '~/components/AssetCard'
import { CURRENCY } from '~/lib/currency'

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
    setOpen(null)
  }
  function toggle(panel: OpenPanel) {
    setOpen(o => (o === panel ? null : panel))
  }

  const currentSort = SORTS.find(s => s.key === sort) ?? SORTS[0]
  const currentCat = CATEGORIES.find(c => c.key === category) ?? CATEGORIES[0]
  const sectionLabel = subCategory ? `${currentCat.label} · ${subCategory}` : currentCat.label
  const priceActive = !!(min || max)
  const priceLabel = priceActive ? `${priceMin || '0'}–${priceMax || '∞'}` : 'Price'
  const anyActive = category !== 'wearable' || !!subCategory || rarities.length > 0 || priceActive

  return (
    <div className="browse">
      {open ? <div className="filterbar__scrim" onClick={() => setOpen(null)} aria-hidden /> : null}

      <div className="filterbar">
        <div className="filterbar__filters">
          {/* Section (category + subcategory) */}
          <div className="filterbar__item">
            <button className={`filterbar__trigger${open === 'section' ? ' is-open' : ''}${subCategory || category !== 'wearable' ? ' is-active' : ''}`} onClick={() => toggle('section')}>
              {sectionLabel} <span className="filterbar__chev" aria-hidden>▾</span>
            </button>
            {open === 'section' ? (
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
                      <button className={`filter-pop__sub${!subCategory ? ' is-active' : ''}`} onClick={() => { setSubCategory(null); setOpen(null) }}>All {currentCat.label}</button>
                    </li>
                    {currentCat.sub.map(s => (
                      <li key={s}>
                        <button className={`filter-pop__sub${subCategory === s ? ' is-active' : ''}`} onClick={() => { setSubCategory(prev => (prev === s ? null : s)); setOpen(null) }}>
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Rarity */}
          <div className="filterbar__item">
            <button className={`filterbar__trigger${open === 'rarity' ? ' is-open' : ''}${rarities.length ? ' is-active' : ''}`} onClick={() => toggle('rarity')}>
              Rarity {rarities.length ? <span className="filterbar__badge">{rarities.length}</span> : null} <span className="filterbar__chev" aria-hidden>▾</span>
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
              {priceLabel} <span className="filterbar__chev" aria-hidden>▾</span>
            </button>
            {open === 'price' ? (
              <div className="filter-pop filter-pop--price">
                <div className="filter-pop__price-row">
                  <input type="number" min="0" placeholder="Min" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
                  <span>–</span>
                  <input type="number" min="0" placeholder="Max" value={priceMax} onChange={e => setPriceMax(e.target.value)} />
                </div>
                <p className="filter-pop__hint">Price in {CURRENCY.name}</p>
              </div>
            ) : null}
          </div>

          {anyActive ? <button className="filterbar__clear" onClick={reset}>Clear all</button> : null}
        </div>

        <div className="filterbar__right">
          <span className="filterbar__count">
            {isLoading ? '…' : `${items.length.toLocaleString()} item${items.length === 1 ? '' : 's'}`}
            {q ? ` for “${q}”` : ''}
          </span>
          <div className="filterbar__item">
            <button className={`filterbar__sort${open === 'sort' ? ' is-open' : ''}`} onClick={() => toggle('sort')}>
              Sort by: {currentSort.label} <span className="filterbar__chev" aria-hidden>▾</span>
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
  )
}
