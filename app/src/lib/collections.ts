import { config } from '~/config'
import type { CatalogItem } from '~/lib/api'

// Sibling items of the same collection — the "more from this collection" carousel — and a creator's
// full storefront. Data source: GET /v3/catalog/items (same full-catalog semantics as the classic
// /v1/items — ALL items, keyed by itemId, not the specific secondary tokens — but with a
// server-computed, asset-type-aware `priceCredits` per item, so we never convert on the client).
// When the user picks an item, its buyable trade is re-resolved via fetchTradeForItem (see ItemDetail).

type RawCollectionItem = {
  id: string
  name: string
  creator?: string
  contractAddress: string
  itemId?: string | null
  category: string
  rarity?: string
  network: string
  chainId: number
  thumbnail?: string
  // Server-computed whole credits (asset-aware: USD-pegged priced directly, MANA converted at the
  // oracle rate; 0 when the item isn't for sale). We consume this as-is — no client conversion.
  priceCredits?: number
  data?: {
    wearable?: { category?: string; bodyShapes?: string[]; isSmart?: boolean }
    emote?: { category?: string }
  }
}

function toGender(bodyShapes?: string[]): CatalogItem['gender'] {
  if (!bodyShapes || bodyShapes.length === 0) return null
  const male = bodyShapes.some(b => b.includes('Male'))
  const female = bodyShapes.some(b => b.includes('Female'))
  if (male && female) return 'unisex'
  if (male) return 'male'
  if (female) return 'female'
  return null
}

function toCatalogItem(r: RawCollectionItem): CatalogItem {
  return {
    id: r.id,
    name: r.name,
    creator: r.creator ?? '',
    contractAddress: r.contractAddress,
    itemId: r.itemId ?? null,
    category: r.category,
    wearableCategory: r.data?.wearable?.category ?? r.data?.emote?.category,
    rarity: r.rarity ?? 'common',
    isSmart: !!r.data?.wearable?.isSmart,
    network: r.network,
    chainId: r.chainId,
    thumbnail: r.thumbnail ?? '',
    priceCredits: r.priceCredits ?? 0,
    gender: toGender(r.data?.wearable?.bodyShapes)
  }
}

export type CollectionItemsPage = { items: CatalogItem[]; total: number }

// Optional browse filters for a collection's grid. Same shape/param names the Creator storefront
// derives (SUBCAT_MAP → wearableCategories, credit price range, shared SORTS). These ride along on
// the classic /v1/items endpoint this page already uses — server-side support for each param is
// unverified (follow-up), so they're only appended when set.
export type CollectionItemsFilters = {
  category?: string
  rarities?: string[]
  wearableCategories?: string[]
  minPriceCredits?: number
  maxPriceCredits?: number
  sortBy?: string
}

export async function fetchCollectionItems(
  contractAddress: string,
  {
    first = 20,
    skip = 0,
    category,
    rarities,
    wearableCategories,
    minPriceCredits,
    maxPriceCredits,
    sortBy
  }: { first?: number; skip?: number } & CollectionItemsFilters = {}
): Promise<CollectionItemsPage> {
  const qs = new URLSearchParams({
    contractAddress,
    first: String(first),
    skip: String(skip),
    includeSocialEmotes: 'false'
  })
  if (category && category !== 'all') qs.set('category', category)
  rarities?.forEach(r => qs.append('rarity', r))
  wearableCategories?.forEach(c => qs.append('wearableCategory', c))
  if (minPriceCredits != null) qs.set('minPrice', String(minPriceCredits))
  if (maxPriceCredits != null) qs.set('maxPrice', String(maxPriceCredits))
  if (sortBy) qs.set('sortBy', sortBy)
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/items?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCollectionItems ${res.status}`)
  const { data, total } = (await res.json()) as { data: RawCollectionItem[]; total?: number }
  const items = (data ?? []).map(toCatalogItem)
  return { items, total: total ?? skip + items.length }
}

// Browse filters for the full catalog grid (/v3/catalog/items) — the "All" and "Not for Sale" browse
// modes (the "On Sale" mode uses the faster unified MV via fetchUnified). Mirrors the on-sale grid's
// filter set (category, rarity, sub-category, search, sort, smart) plus `isOnSale` to split for-sale
// from not-for-sale items. Signal: an item's server-computed priceCredits === 0 ⟺ not for sale.
export type CatalogItemsFilters = {
  first?: number
  skip?: number
  category?: string
  rarities?: string[]
  wearableCategories?: string[]
  search?: string
  sortBy?: string
  // From the Filters "Smart" toggle → the endpoint's isWearableSmart param.
  isWearableSmart?: boolean
  // Listing status: true = on sale only, false = not-for-sale only, undefined = all.
  isOnSale?: boolean
}

export async function fetchCatalogItems({
  first = 48,
  skip = 0,
  category,
  rarities,
  wearableCategories,
  search,
  sortBy,
  isWearableSmart,
  isOnSale
}: CatalogItemsFilters = {}): Promise<CollectionItemsPage> {
  const qs = new URLSearchParams({
    first: String(first),
    skip: String(skip),
    includeSocialEmotes: 'false'
  })
  if (category && category !== 'all') qs.set('category', category)
  rarities?.forEach(r => qs.append('rarity', r))
  wearableCategories?.forEach(c => qs.append('wearableCategory', c))
  if (search) qs.set('search', search)
  if (sortBy) qs.set('sortBy', sortBy)
  if (isWearableSmart) qs.set('isWearableSmart', 'true')
  if (isOnSale != null) qs.set('isOnSale', String(isOnSale))
  // NOTE: the credit price-range filter is intentionally omitted here — /v3/catalog/items takes a
  // MANA-denominated minPrice/maxPrice (not credits), so wiring the shop's credit range to it would
  // mis-filter. Left as a follow-up (needs a credit-aware range param on the endpoint).
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/items?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCatalogItems ${res.status}`)
  const { data, total } = (await res.json()) as { data: RawCollectionItem[]; total?: number }
  const items = (data ?? []).map(toCatalogItem)
  return { items, total: total ?? skip + items.length }
}

// Every catalog item made by one creator (their storefront). Same source/shape as the collection
// fetch, filtered by `creator`.
export async function fetchCreatorItems(
  creator: string,
  { first = 60, skip = 0 }: { first?: number; skip?: number } = {}
): Promise<CollectionItemsPage> {
  const qs = new URLSearchParams({ creator, first: String(first), skip: String(skip), includeSocialEmotes: 'false' })
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/items?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCreatorItems ${res.status}`)
  const { data, total } = (await res.json()) as { data: RawCollectionItem[]; total?: number }
  const items = (data ?? []).map(toCatalogItem)
  return { items, total: total ?? skip + items.length }
}

type RawCollection = { contractAddress: string; name?: string; creator?: string; size?: number }

export type CollectionMeta = { contractAddress: string; name: string; creator: string }

// A collection summary for grids/cards: meta + its item count. The collections entity carries `size`
// (the number of items), so the count comes back with the list — no per-collection items fetch needed.
export type CollectionSummary = CollectionMeta & { itemCount: number }

export type CreatorCollectionsPage = { collections: CollectionSummary[]; total: number }

// Every collection published by one creator (their storefront's "Collections" view). Mirrors the
// marketplace's collectionAPI.fetch({ creator }); newest first. `/v1/collections` supports the
// `creator` filter and returns `size`, which we surface as the card's item count.
export async function fetchCreatorCollections(
  creator: string,
  { first = 24, skip = 0 }: { first?: number; skip?: number } = {}
): Promise<CreatorCollectionsPage> {
  const qs = new URLSearchParams({
    creator,
    first: String(first),
    skip: String(skip),
    sortBy: 'newest'
  })
  const res = await fetch(`${config.marketplaceServerUrl}/v1/collections?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCreatorCollections ${res.status}`)
  const { data, total } = (await res.json()) as { data?: RawCollection[]; total?: number }
  const collections = (data ?? []).map(c => ({
    contractAddress: c.contractAddress,
    name: c.name ?? '',
    creator: c.creator ?? '',
    itemCount: c.size ?? 0
  }))
  return { collections, total: total ?? skip + collections.length }
}

// A single collection's metadata (name + creator) by contract address. Item records don't carry the
// collection name — it lives only on the collections entity — so the Collection page resolves it
// here (mirrors the marketplace's collectionAPI.fetchOne). Null if the collection isn't found.
export async function fetchCollection(contractAddress: string): Promise<CollectionMeta | null> {
  const qs = new URLSearchParams({ contractAddress, first: '1' })
  const res = await fetch(`${config.marketplaceServerUrl}/v1/collections?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCollection ${res.status}`)
  const { data } = (await res.json()) as { data?: RawCollection[] }
  const c = data?.[0]
  return c && c.contractAddress
    ? { contractAddress: c.contractAddress, name: c.name ?? '', creator: c.creator ?? '' }
    : null
}
