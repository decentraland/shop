import { ethers } from 'ethers'
import { config } from '~/config'
import type { CatalogItem } from '~/lib/api'

// Sibling items of the same collection — the "more from this collection" carousel.
// Data source (mirrors the marketplace ItemAPI.get()): GET /v1/items?contractAddress=<collection>.
// This returns the collection's CATALOG items (keyed by itemId, price = cheapest/mint listing),
// NOT the specific secondary-listing tokens. That's fine for a "browse the collection" carousel:
// when the user picks one, its buyable trade is re-resolved via fetchTradeForItem (see ItemDetail).

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
  price?: string | null
  minPrice?: string | null
  data?: {
    wearable?: { category?: string; bodyShapes?: string[] }
    emote?: { category?: string }
  }
}

// USD-pegged listing price (USD wei, 1e18 = $1) → fixed credits (1 credit = $0.10), so $1 = 10 credits.
// Kept in sync with lib/api.ts's toCredits (that one isn't exported).
function toCredits(price?: string | null): number {
  if (!price) return 0
  try {
    // Whole credits, rounded UP to match the charge (Model B — kept in sync with lib/api.ts's toCredits).
    return Math.ceil(Number(ethers.utils.formatEther(price)) * 10)
  } catch {
    return 0
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
    priceCredits: toCredits(r.price ?? r.minPrice),
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
  const res = await fetch(`${config.nftApiUrl}/v1/items?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCollectionItems ${res.status}`)
  const { data, total } = (await res.json()) as { data: RawCollectionItem[]; total?: number }
  const items = (data ?? []).map(toCatalogItem)
  return { items, total: total ?? skip + items.length }
}

// Every catalog item made by one creator (their storefront). Same source/shape as the collection
// fetch, filtered by `creator` (the classic /v1/items API supports it — no shop-catalog change needed).
export async function fetchCreatorItems(
  creator: string,
  { first = 60, skip = 0 }: { first?: number; skip?: number } = {}
): Promise<CollectionItemsPage> {
  const qs = new URLSearchParams({ creator, first: String(first), skip: String(skip), includeSocialEmotes: 'false' })
  const res = await fetch(`${config.nftApiUrl}/v1/items?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCreatorItems ${res.status}`)
  const { data, total } = (await res.json()) as { data: RawCollectionItem[]; total?: number }
  const items = (data ?? []).map(toCatalogItem)
  return { items, total: total ?? skip + items.length }
}
