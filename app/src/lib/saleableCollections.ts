import type { PublishableItem } from '~/lib/builder'
import type { CollectionSaleState } from '~/lib/collections'
import type { SaleableCollection } from '~/components/CreatorSaleModal'

/**
 * The creator's collections as a discount sees them.
 *
 * Every item goes in, listed or not: the sale only re-prices the listed ones, and the review step has to be
 * able to say which of the rest it will leave alone. Sold-out items are the exception — there is no copy
 * left for a discount to re-price, so they belong in neither group.
 *
 * Offered wherever something is LISTED, in either currency. A collection sold entirely in MANA cannot take
 * a discount yet, but it is still offered one: the modal answers why and where to fix it, where an absent
 * button explains nothing. A collection with nothing listed at all stays out — there the answer is to list
 * something, which this flow is not about.
 */
export function toSaleableCollections(
  items: PublishableItem[],
  saleState: Record<string, CollectionSaleState> | undefined
): SaleableCollection[] {
  const byAddress = new Map<string, SaleableCollection>()

  for (const item of items) {
    if (item.remainingSupply <= 0) continue
    const sale = saleState?.[`${item.contractAddress}-${item.blockchainItemId}`]
    // Three states, because "on sale" is not one thing here: a discount re-prices the Shop's own credit
    // listings, so an item still quoted in MANA cannot take one — but it IS listed, and the review has to
    // say that rather than call it not for sale.
    const state = !sale?.isOnSale ? 'unlisted' : sale.manaWei ? 'classic' : 'discounted'
    const listedInCredits = state === 'discounted'
    const key = item.contractAddress.toLowerCase()
    const entry = byAddress.get(key) ?? {
      contractAddress: key,
      name: item.collectionName,
      listedCount: 0,
      examplePriceCredits: null,
      items: []
    }
    entry.items.push({
      key: `${key}-${item.blockchainItemId}`,
      name: item.name,
      thumbnail: item.thumbnail,
      priceCredits: listedInCredits && sale ? sale.priceCredits : null,
      state,
      remainingSupply: item.remainingSupply
    })
    if (listedInCredits && sale) {
      entry.listedCount += 1
      entry.examplePriceCredits = Math.max(entry.examplePriceCredits ?? 0, sale.priceCredits)
    }
    byAddress.set(key, entry)
  }

  return [...byAddress.values()].filter(c => c.listedCount > 0 || c.items.some(i => i.state === 'classic'))
}
