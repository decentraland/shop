import { TradeAssetType, type Trade } from '@dcl/schemas'
import { usdWeiToCents, type CatalogItem } from '~/lib/api'
import { usdCentsToCredits } from '~/lib/currency'
import { manaWeiToUsdCents, type ManaRate } from '~/lib/mana-convert'
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
  usdCents: number // authoritative USD amount from the live trade (what we authorize) — PER UNIT
  priceCredits: number // whole credits shown for that amount (1 credit = $0.10, rounded up) — PER UNIT
  quantity: number // how many units of this line to buy (always 1 for a secondary token)
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
  return usdCentsToCredits(usdCents)
}

/**
 * What a line costs in USD cents, read from the LIVE trade.
 *
 * The two kinds of listing in the catalogue denominate that amount differently, and the trade itself is
 * what says which — not the cart item:
 *
 *   - `USD_PEGGED_MANA` — a Shop-native listing. The amount already IS USD wei, so it converts directly.
 *   - `ERC20` — a legacy listing signed by the older Marketplace, priced in MANA. The amount is MANA wei
 *     and only the oracle can say what it is worth, so it needs the live rate.
 *
 * Reading `usdWeiToCents` on a legacy amount does not return a slightly-wrong number — it returns a
 * meaningless one (MANA wei interpreted as USD wei, off by the MANA price), which is why this has to
 * branch rather than being one conversion. Returns 0 when it cannot price the line honestly (no rate for
 * a legacy trade, a malformed amount); the caller treats 0 as "not a real live listing".
 */
export function lineUsdCents(trade: Trade, rate?: ManaRate): number {
  const priceAsset = trade.received[0] as { assetType?: number; amount?: string } | undefined
  if (!priceAsset) return 0

  if (priceAsset.assetType === Number(TradeAssetType.USD_PEGGED_MANA)) {
    return usdWeiToCents(priceAsset.amount)
  }

  // Legacy: MANA-denominated. Without a rate we cannot price it, and guessing is worse than deferring.
  if (!rate || !priceAsset.amount) return 0
  return manaWeiToUsdCents(priceAsset.amount, rate)
}

/**
 * Resolve + classify every cart item against its live listing. Never throws for a single bad row: a
 * failed/absent resolution becomes `unavailable`, the buyer's own listing becomes `own`, and the rest
 * are `buyable` with their live price. Resolved SEQUENTIALLY to keep behaviour deterministic and avoid
 * hammering the API on a large basket (these are reads — no reservation happens here).
 */
export async function reviewCart(
  items: Array<CatalogItem & { quantity?: number }>,
  buyerAddress: string,
  resolve: TradeResolver,
  /**
   * Live MANA/USD rate, needed ONLY to price legacy (plain-ERC20, MANA-denominated) lines — see
   * `lineUsdCents`. Omit it and legacy lines resolve as `unavailable` rather than being priced off a
   * missing rate: showing "no longer available" is recoverable, charging the wrong amount is not.
   */
  rate?: ManaRate
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
      const usdCents = lineUsdCents(trade, rate)
      // A zero/NaN price (empty received, missing/bad amount) is not a real live listing — never let it
      // enter the basket priced at 0, which would authorize a $0 credit and revert on-chain.
      if (!Number.isFinite(usdCents) || usdCents <= 0) {
        unavailable.push(item)
        continue
      }
      // Quantity applies only to primary (mint) lines; a secondary token is always a single unit.
      const quantity = !item.tokenId ? Math.max(1, Math.floor(item.quantity ?? 1)) : 1
      buyable.push({ item, trade, usdCents, priceCredits: centsToCredits(usdCents), quantity })
    } catch {
      unavailable.push(item)
    }
  }

  // Live total sums each buyable line's per-unit credit price × its quantity.
  const liveTotalCredits = buyable.reduce((sum, line) => sum + line.priceCredits * line.quantity, 0)
  const orderChanged =
    unavailable.length > 0 || own.length > 0 || buyable.some(line => line.priceCredits !== line.item.priceCredits)

  return { buyable, unavailable, own, liveTotalCredits, orderChanged }
}
