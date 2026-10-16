import { config } from '~/config'
import type { PublishableItem } from '~/lib/builder'
import type { CollectionSaleState } from '~/lib/collections'
import { getCouponContracts } from '~/lib/coupons'
import { getCouponManagerForTrade } from '~/lib/marketplace'

/**
 * Whether a creator's new coupon can discount this MANA listing: a trade (a collection-store price never can)
 * whose marketplace redeems coupons through the manager a new sale is signed against.
 */
export function isDiscountableManaListing(sale: CollectionSaleState, chainId: number = config.chainId): boolean {
  if (!sale.manaWei || !sale.manaTradeContract) return false
  const manager = getCouponManagerForTrade({ contract: sale.manaTradeContract, chainId })
  const signing = getCouponContracts(chainId)?.couponManager.address.toLowerCase()
  return manager != null && manager === signing
}

/**
 * One of the collection's creations, as the review step needs it.
 *
 * Three states, not two. A discount re-prices the listings a coupon can reach, so an item at a price it
 * cannot change is left out — but it is NOT unlisted, and telling a creator it is "not for sale" when they can see
 * it on sale a click away is worse than saying nothing. It has its own state so the review can name the
 * one thing that would bring it in: updating its price.
 */
export type SaleItem = {
  key: string
  name: string
  thumbnail: string
  /** Its Shop price in credits. Null unless `state` is 'discounted'. */
  priceCredits: number | null
  /** 'discounted' takes the sale, 'classic' is listed at a price it cannot change, 'unlisted' is not for sale. */
  state: 'discounted' | 'classic' | 'unlisted'
  /** A MANA listing the sale discounts. Its `priceCredits` is the catalogue's conversion, not the live rate. */
  mana?: boolean
  remainingSupply: number
}

/** A collection the creator can put on sale: one of theirs with at least one item listed in the Shop. */
export type SaleableCollection = {
  contractAddress: string
  name: string
  listedCount: number
  /**
   * The highest listed price, for the example line. The highest rather than the cheapest because a 1-credit
   * item rounds any discount away and the example would read "1 credit sells for 1 credit". Null when unknown.
   */
  examplePriceCredits: number | null
  /** Every creation in it, listed or not — the review step has to account for both. */
  items: SaleItem[]
}

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
  saleState: Record<string, CollectionSaleState> | undefined,
  // Whether the catalogue discounts MANA listings for buyers (the shop-legacy-coupons flag): only then does a
  // coupon on one reach the price a buyer sees, so only then is it offered to the creator as discountable.
  { manaListings = false, chainId = config.chainId }: { manaListings?: boolean; chainId?: number } = {}
): SaleableCollection[] {
  const byAddress = new Map<string, SaleableCollection>()

  for (const item of items) {
    if (item.remainingSupply <= 0) continue
    const sale = saleState?.[`${item.contractAddress}-${item.blockchainItemId}`]
    // Three states, because "on sale" is not one thing here: a discount re-prices the Shop's own credit
    // listings, so an item still quoted in MANA cannot take one — but it IS listed, and the review has to
    // say that rather than call it not for sale.
    const manaDiscounted =
      !!sale?.isOnSale && !!sale.manaWei && manaListings && isDiscountableManaListing(sale, chainId)
    const state = !sale?.isOnSale ? 'unlisted' : sale.manaWei && !manaDiscounted ? 'classic' : 'discounted'
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
      ...(manaDiscounted ? { mana: true } : {}),
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
