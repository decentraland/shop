import type { CatalogItem } from '~/lib/api'

// A catalogue row as marketplace-server's item feeds return it (/v3/catalog/items, /v3/catalog/suggest),
// and the one mapping to the app's CatalogItem, shared by every fetch that reads those feeds.

export type RawCollectionItem = {
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
  // The canonical asset urn. /v3/catalog/items returns it on every row, and it is the ONLY thing that
  // identifies a non-Polygon item to the 3D preview — see CatalogItem.urn.
  urn?: string
  // Server-computed whole credits. Trustworthy ONLY for a USD-pegged listing: for a MANA-denominated one
  // it is converted with the SERVER's rate, which is not the rate checkout charges (see lib/pricing).
  priceCredits?: number
  // Mixed-unit price: USD wei when the row's listing is USD-pegged, MANA wei otherwise. `tradeId: null`
  // with a price is unambiguous — a collection-store mint or a classic order, i.e. MANA.
  price?: string | null
  tradeId?: string | null
  available?: string | number | null
  isOnSale?: boolean
  data?: {
    wearable?: { category?: string; bodyShapes?: string[]; isSmart?: boolean }
    emote?: { category?: string; loop?: boolean; hasSound?: boolean; hasGeometry?: boolean }
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

export function toCatalogItem(r: RawCollectionItem): CatalogItem {
  return {
    id: r.id,
    name: r.name,
    creator: r.creator ?? '',
    contractAddress: r.contractAddress,
    itemId: r.itemId ?? null,
    urn: r.urn,
    category: r.category,
    wearableCategory: r.data?.wearable?.category ?? r.data?.emote?.category,
    emoteLoop: r.data?.emote?.loop,
    emoteHasSound: r.data?.emote?.hasSound,
    emoteHasProps: r.data?.emote?.hasGeometry,
    rarity: r.rarity ?? 'common',
    isSmart: !!r.data?.wearable?.isSmart,
    network: r.network,
    chainId: r.chainId,
    thumbnail: r.thumbnail ?? '',
    priceCredits: r.priceCredits ?? 0,
    /**
     * A row with NO trade is priced in MANA — a collection-store mint or a classic order. Carrying it as
     * `manaWei` is what lets `displayCredits` price it at the LIVE rate, like the browse grid does: this feed
     * also reports a `priceCredits`, but it is converted with the SERVER's rate. Measured on production, a
     * 20-MANA store mint arrived as 4 credits while the live rate makes it 14 — the number the grid showed
     * and this page did not.
     *
     * Deliberately NOT labelled `acquisition: 'store'`: this feed cannot tell a store mint from a classic
     * order, and mislabelling one would route it to the wrong purchase rail. The unified feed (which the
     * item page and the cart read) does carry that discriminator.
     */
    ...(r.tradeId == null && r.isOnSale && r.price ? { manaWei: r.price, available: toAvailable(r.available) } : {}),
    gender: toGender(r.data?.wearable?.bodyShapes)
  }
}

function toAvailable(value: string | number | null | undefined): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : undefined
}
