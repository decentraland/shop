import type { CatalogItem } from '~/lib/api'

/** The server takes at most this many seeds; anything past it is dropped before the request. */
export const MAX_SEEDS = 20

/** `contract-itemId`, the identity the suggestions endpoint keys on. Null for a row that has no
 * item id — a name or a LAND parcel, which the recommender has nothing to say about. */
export function seedIdOf(item: Pick<CatalogItem, 'contractAddress' | 'itemId'>): string | null {
  if (!item.contractAddress || !item.itemId) return null
  return `${item.contractAddress.toLowerCase()}-${item.itemId}`
}

/**
 * What this browser can tell the server that the server cannot look up for itself.
 *
 * Favourites are deliberately NOT here. They live in the marketplace's own store, which the server
 * reads directly for a caller who signed the request — sending them from here as well would spend the
 * cap below on data the server already has, and at the seed weight rather than the favourite one.
 *
 * Ordered by how much intent each source carries rather than by recency: putting something in the cart
 * is the strongest signal short of buying it, and a view is the weakest. The cap is applied after that
 * ordering, so a visitor who has browsed a lot still spends their twenty slots on the things they
 * showed most interest in.
 *
 * Deduplicated, because the same item routinely appears in both.
 */
export function buildSuggestionSeeds(sources: {
  cart?: Array<Pick<CatalogItem, 'contractAddress' | 'itemId'>>
  recentlyViewed?: Array<Pick<CatalogItem, 'contractAddress' | 'itemId'>>
}): string[] {
  const seeds: string[] = []
  const seen = new Set<string>()

  for (const group of [sources.cart, sources.recentlyViewed]) {
    for (const item of group ?? []) {
      const id = seedIdOf(item)
      if (!id || seen.has(id)) continue
      seen.add(id)
      seeds.push(id)
      if (seeds.length >= MAX_SEEDS) return seeds
    }
  }

  return seeds
}

/** Stable, order-independent key for the seed set, so react-query refetches when the seeds really
 * change and not when they are merely re-derived in a different order. */
export function seedsKey(seeds: string[]): string {
  return [...seeds].sort().join(',')
}
