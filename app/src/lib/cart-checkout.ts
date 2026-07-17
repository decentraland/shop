import type { Trade } from '@dcl/schemas'
import { usdWeiToCents, type CatalogItem } from '~/lib/api'
import { isOwnTrade } from '~/lib/ownership'

// Cart checkout review: resolve every cart item's LIVE listing before charging, so the buyer is never
// silently charged a stale snapshot price and one bad item never aborts the whole basket.
//
// The cart stores each item's price from when it was added (item.priceCredits). By checkout the live
// listing may have re-priced (a flash sale ended, the seller changed it) or vanished (sold/cancelled),
// or be the buyer's own listing (unbuyable). reviewCart classifies each row against its live trade so
// the UI can prune the unbuyable ones, show the updated total, and ask for confirmation when anything
// differs from what was displayed.

export type ResolvedLine = {
  item: CatalogItem
  trade: Trade
  usdCents: number // authoritative USD amount from the live trade (what we authorize)
  priceCredits: number // whole credits shown for that amount (1 credit = $0.10, rounded up)
}

export type CartReview = {
  buyable: ResolvedLine[] // resolvable, not the buyer's own — safe to charge
  unavailable: CatalogItem[] // no live listing (sold / cancelled / never resolved)
  own: CatalogItem[] // the buyer's own listing — can't buy
  liveTotalCredits: number // sum of the buyable lines' live credit prices
  orderChanged: boolean // a live price differs from what the cart showed, or rows were dropped
}

// sessionStorage key: the cart snapshot stashed when a buyer is sent to Stripe to top up mid-checkout
// (the insufficient-funds → pack picker flow). It survives the full-page Stripe redirect (which wipes
// the in-memory cart store); after the credits land, the /credits return handler routes back to /cart,
// which restores this snapshot and resumes the checkout. Mirrors BuyModal's RESUME_BUY_KEY (per-item).
export const RESUME_CART_KEY = 'dcl_shop_resume_cart'

// Resolves an item to its current on-chain-signed trade, or null when there's no live listing.
export type TradeResolver = (item: CatalogItem) => Promise<Trade | null>

// USD cents → whole credits shown (1 credit = $0.10, rounded up — the shop's whole-credit model).
export function centsToCredits(usdCents: number): number {
  return Math.ceil(usdCents / 10)
}

/**
 * Resolve + classify every cart item against its live listing. Never throws for a single bad row: a
 * failed/absent resolution becomes `unavailable`, the buyer's own listing becomes `own`, and the rest
 * are `buyable` with their live price. Resolved SEQUENTIALLY to keep behaviour deterministic and avoid
 * hammering the API on a large basket (these are reads — no reservation happens here).
 */
export async function reviewCart(
  items: CatalogItem[],
  buyerAddress: string,
  resolve: TradeResolver
): Promise<CartReview> {
  const buyable: ResolvedLine[] = []
  const unavailable: CatalogItem[] = []
  const own: CatalogItem[] = []

  for (const item of items) {
    // The whole per-item body is guarded: ANY failure (resolve error, a malformed trade with an empty
    // `received`, a bad amount) classifies the row as unavailable rather than throwing out of
    // reviewCart — one bad row must never abort the basket.
    try {
      const trade = await resolve(item)
      if (!trade) {
        unavailable.push(item)
        continue
      }
      if (isOwnTrade(trade, buyerAddress)) {
        own.push(item)
        continue
      }
      const usdCents = usdWeiToCents((trade.received[0] as { amount?: string } | undefined)?.amount)
      // A zero/NaN price (empty received, missing/bad amount) is not a real live listing — never let it
      // enter the basket priced at 0, which would authorize a $0 credit and revert on-chain.
      if (!Number.isFinite(usdCents) || usdCents <= 0) {
        unavailable.push(item)
        continue
      }
      buyable.push({ item, trade, usdCents, priceCredits: centsToCredits(usdCents) })
    } catch {
      unavailable.push(item)
    }
  }

  const liveTotalCredits = buyable.reduce((sum, line) => sum + line.priceCredits, 0)
  const orderChanged =
    unavailable.length > 0 || own.length > 0 || buyable.some(line => line.priceCredits !== line.item.priceCredits)

  return { buyable, unavailable, own, liveTotalCredits, orderChanged }
}
