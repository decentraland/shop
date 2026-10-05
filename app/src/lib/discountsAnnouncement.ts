import { salePriceOf } from '~/lib/sale'
import type { SaleableCollection } from '~/lib/saleableCollections'

/** The discount the announcement prices its example at. */
export const ANNOUNCEMENT_PCT = 30

/** How far back the announcement looks for the collection that is selling. */
export const ANNOUNCEMENT_SALES_DAYS = 30

/** How many of a collection's items are priced in Credits at a price the discount visibly lowers. */
function discountableCount(collection: SaleableCollection, pct: number): number {
  return collection.items.filter(
    item =>
      item.state === 'discounted' &&
      item.priceCredits !== null &&
      salePriceOf(item.priceCredits, pct) < item.priceCredits
  ).length
}

/**
 * The collection the discounts announcement uses as its example, or null when the creator has none to show.
 *
 * Only collections with an item priced in Credits whose price the example discount visibly lowers qualify:
 * a discount applies to Credits listings only, and a 1-credit item rounds any cut back to its own price.
 * Of those, the one that sold the most in the recent window, and then the one with the most such items.
 *
 * @param collections - The creator's collections as the discount flow sees them.
 * @param soldByCollection - Recent sales per collection, keyed by lowercase contract address.
 */
export function pickAnnouncementCollection(
  collections: SaleableCollection[],
  soldByCollection: ReadonlyMap<string, number>,
  pct: number = ANNOUNCEMENT_PCT
): SaleableCollection | null {
  const candidates = collections
    .map(collection => ({
      collection,
      discountable: discountableCount(collection, pct),
      sold: soldByCollection.get(collection.contractAddress.toLowerCase()) ?? 0
    }))
    .filter(candidate => candidate.discountable > 0)
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.sold - a.sold || b.discountable - a.discountable)
  return candidates[0].collection
}
