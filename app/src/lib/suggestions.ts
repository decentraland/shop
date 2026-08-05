import type { CatalogItem } from '~/lib/api'

/**
 * How many cards the PDP rail aims to fill. Most collections hold only a handful of items, so the
 * collection tier alone leaves a near-empty rail — the padding tiers exist to reach this floor.
 */
export const SUGGESTIONS_TARGET = 15

/** The item the rail is shown next to; every tier must exclude it. */
export type SuggestionAnchor = {
  id?: string
  contractAddress?: string
  itemId?: string | null
  tokenId?: string
}

export type SuggestionTiers = {
  /** Other items in the anchor's own collection. Shown in full, even past the target. */
  collection: CatalogItem[]
  /** The anchor creator's other work, used to pad a short collection. */
  creator?: CatalogItem[]
  /** Same category/sub-category items from anywhere, the last resort. */
  related?: CatalogItem[]
}

export type MergedSuggestions = {
  items: CatalogItem[]
  /**
   * True when every card came from the anchor's collection — the only case where the rail can honestly
   * be titled after the collection and offer a "View all" link to it.
   */
  isCollectionOnly: boolean
}

// Identity is (contract, item) — NOT `id`, which is a tradeId on the unified feeds and a
// contract-itemId on the catalog feed, so the same item arrives under two different ids across tiers.
function identity(item: CatalogItem): string {
  return `${item.contractAddress?.toLowerCase()}-${item.itemId ?? item.tokenId ?? item.id}`.toLowerCase()
}

function isAnchor(item: CatalogItem, anchor: SuggestionAnchor): boolean {
  if (anchor.id && item.id === anchor.id) return true
  if (anchor.itemId && item.itemId === anchor.itemId && sameContract(item, anchor)) return true
  if (anchor.tokenId && item.tokenId === anchor.tokenId) return true
  return false
}

function sameContract(item: CatalogItem, anchor: SuggestionAnchor): boolean {
  if (!anchor.contractAddress) return true
  return item.contractAddress?.toLowerCase() === anchor.contractAddress.toLowerCase()
}

/**
 * Fill the PDP rail from the collection first, then pad to `target` with the creator's other items and
 * finally with similar ones. Drops the anchor and any item already taken by an earlier tier.
 *
 * The collection tier is never truncated: a large collection keeps showing everything it returned (the
 * behaviour before padding existed). The padding tiers only ever run up to the target.
 */
export function mergeSuggestions(
  tiers: SuggestionTiers,
  anchor: SuggestionAnchor,
  target: number = SUGGESTIONS_TARGET
): MergedSuggestions {
  const seen = new Set<string>()
  const items: CatalogItem[] = []

  function take(source: CatalogItem[], limit: number) {
    for (const item of source) {
      if (items.length >= limit) return
      if (isAnchor(item, anchor)) continue
      const key = identity(item)
      if (seen.has(key)) continue
      seen.add(key)
      items.push(item)
    }
  }

  take(tiers.collection, Infinity)
  const collectionCount = items.length
  take(tiers.creator ?? [], target)
  take(tiers.related ?? [], target)

  return { items, isCollectionOnly: items.length === collectionCount }
}
