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
    wearable?: { category?: string; bodyShapes?: string[] }
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
    network: r.network,
    chainId: r.chainId,
    thumbnail: r.thumbnail ?? '',
    priceCredits: r.priceCredits ?? 0,
    gender: toGender(r.data?.wearable?.bodyShapes)
  }
}

export type CollectionItemsPage = { items: CatalogItem[]; total: number }

export async function fetchCollectionItems(
  contractAddress: string,
  { first = 20, skip = 0 }: { first?: number; skip?: number } = {}
): Promise<CollectionItemsPage> {
  const qs = new URLSearchParams({
    contractAddress,
    first: String(first),
    skip: String(skip),
    includeSocialEmotes: 'false'
  })
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/items?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCollectionItems ${res.status}`)
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

type RawCollection = { contractAddress: string; name?: string; creator?: string }

export type CollectionMeta = { contractAddress: string; name: string; creator: string }

// A single collection's metadata (name + creator) by contract address. Item records don't carry the
// collection name — it lives only on the collections entity — so the Collection page resolves it
// here (mirrors the marketplace's collectionAPI.fetchOne). Null if the collection isn't found.
export async function fetchCollection(contractAddress: string): Promise<CollectionMeta | null> {
  const qs = new URLSearchParams({ contractAddress, first: '1' })
  const res = await fetch(`${config.nftApiUrl}/v1/collections?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCollection ${res.status}`)
  const { data } = (await res.json()) as { data?: RawCollection[] }
  const c = data?.[0]
  return c && c.contractAddress
    ? { contractAddress: c.contractAddress, name: c.name ?? '', creator: c.creator ?? '' }
    : null
}
