import { Rarity } from '@dcl/schemas'
import { config } from '~/config'
import { fetchCreatorCollections } from '~/lib/collections'
import type { StoreCatalogueItem } from '~/lib/storeStats'

const PAGE = 100

type RawRow = {
  id: string
  name: string
  contractAddress: string
  itemId?: string | null
  category: string
  rarity?: string
  thumbnail?: string
  available?: string | number | null
  createdAt?: number
}

/**
 * The creator's published items from the public catalogue.
 *
 * Supply comes from `available` against the rarity's cap, which is the remaining supply the item page shows
 * a buyer rather than a listing's stock.
 */
export async function fetchPublicCatalogue(creator: string): Promise<StoreCatalogueItem[]> {
  const [{ collections }, rows] = await Promise.all([
    fetchCreatorCollections(creator, { first: PAGE }),
    fetchCreatorRows(creator)
  ])
  const names = new Map(collections.map(collection => [collection.contractAddress.toLowerCase(), collection.name]))

  return rows.map(row => {
    const contractAddress = row.contractAddress.toLowerCase()
    const rarity = (row.rarity ?? 'common').toLowerCase()
    const max = maxSupplyOf(rarity)
    const remaining = Number(row.available ?? 0)
    return {
      id: row.id,
      // Empty: the builder id is what its URLs take, and the builder is exactly what did not return these.
      collectionId: '',
      collectionName: names.get(contractAddress) ?? row.name,
      contractAddress,
      blockchainItemId: String(row.itemId ?? ''),
      name: row.name,
      category: row.category,
      rarity,
      thumbnail: row.thumbnail ?? '',
      type: row.category === 'emote' ? 'emote' : 'wearable',
      isPublished: true,
      isApproved: true,
      totalSupply: Math.max(0, max - remaining),
      maxSupply: max,
      remainingSupply: remaining,
      createdAt: row.createdAt ? row.createdAt * 1000 : undefined,
      minters: []
    }
  })
}

/**
 * The builder's catalogue, plus the public items of every collection the builder did not return.
 *
 * The builder can leave out collections a creator published and sells (seen on real stores), and a sale
 * from one of them then has no name, no thumbnail and no collection. Collections the builder does return
 * are never replaced: its figures are the ones the rest of the page is built on.
 */
export function withMissingCollections(
  builder: StoreCatalogueItem[],
  publicItems: StoreCatalogueItem[]
): StoreCatalogueItem[] {
  const known = new Set(builder.map(item => item.contractAddress.toLowerCase()))
  return [...builder, ...publicItems.filter(item => !known.has(item.contractAddress.toLowerCase()))]
}

function maxSupplyOf(rarity: string): number {
  try {
    return Rarity.getMaxSupply(rarity as Rarity)
  } catch {
    return 0
  }
}

async function fetchCreatorRows(creator: string): Promise<RawRow[]> {
  const all: RawRow[] = []
  for (let skip = 0; ; skip += PAGE) {
    const qs = new URLSearchParams({ creator, first: String(PAGE), skip: String(skip), includeSocialEmotes: 'false' })
    const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/items?${qs.toString()}`)
    if (!res.ok) {
      await res.body?.cancel()
      throw new Error(`fetchPublicCatalogue ${res.status}`)
    }
    const { data } = (await res.json()) as { data?: RawRow[] }
    const page = data ?? []
    all.push(...page)
    if (page.length < PAGE) return all
  }
}
