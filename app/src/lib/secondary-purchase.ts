import { TradeAssetType, type Trade } from '@dcl/schemas'
import { getIsSecondaryPurchaseEnabled } from '~/lib/featureFlags'

/**
 * The buyer-side kill switch for RESALES, applied to the functions that actually spend.
 *
 * The CTAs are hidden when `shop-secondary-purchases` is off, so nothing here should be reachable. It
 * exists because hiding a button is not a switch: a persisted cart, a deep link, a resumed Stripe
 * checkout and a stale react-query snapshot all carry a resale past the render that would have hidden it.
 * Mirrors what `lib/import` does on the SELLING side, and for the same reason — a flag has to mean off at
 * the last step, not only at the first.
 *
 * It does NOT stop a transaction already signed and broadcast. Nothing client-side can; the only thing
 * that refuses a resale on-chain is `CreditsManagerPolygon.secondarySalesAllowed`.
 */

/** A resale line, judged from the catalogue row: a row scoped to one specific token is somebody's copy. */
export function isSecondaryItem(item: { tokenId?: string | null }): boolean {
  return !!item.tokenId
}

/**
 * Whether a SIGNED trade is a resale.
 *
 * Read off the trade rather than off the catalogue row that led to it, because this is the last check
 * before the calldata is built: `tokenId` on a cart line is display data that a stale cache or a crafted
 * router state can carry, while `sent` is what the contract will actually move. A resale sends an ERC721
 * (one existing token); a mint sends a COLLECTION_ITEM (a fresh copy). Same discriminator
 * `CreditsManagerPolygon._handleMarketplacePreExecution` branches on.
 */
export function isSecondaryTrade(trade: Pick<Trade, 'sent'>): boolean {
  return (trade.sent ?? []).some(asset => Number(asset.assetType) === Number(TradeAssetType.ERC721))
}

/**
 * The trades among a basket of purchases, whichever of the two shapes an entry takes.
 *
 * A basket entry is either `{ kind: 'trade' | 'store', ... }` or the bare trade purchase that predates the
 * discriminator and carries no `kind` at all — `lib/buy.normalizePurchases` reads an absent `kind` as
 * `'trade'`, and so does this. Kept here rather than at each rail because four rails ask the same question
 * and a rail that answered it differently would be a rail the kill switch does not cover.
 */
export function tradesIn(purchases: readonly { kind?: string; trade?: Pick<Trade, 'sent'> }[]): Pick<Trade, 'sent'>[] {
  return purchases.flatMap(p => ((p.kind ?? 'trade') === 'trade' && p.trade ? [p.trade] : []))
}

/**
 * Refuses the purchase when any of these trades is a resale and resales are not being sold.
 *
 * Plain-English message on purpose: `lib/errors.friendlyError` never surfaces raw text, so every caller
 * shows its own curated copy and this string only ever reaches Sentry and the console. Worded so it
 * matches none of `friendlyError`'s `sale` patterns, which would mislabel it as a sold-out item.
 */
export async function assertSecondaryPurchasesAllowed(trades: readonly Pick<Trade, 'sent'>[]): Promise<void> {
  if (!trades.some(isSecondaryTrade)) return
  if (await getIsSecondaryPurchaseEnabled()) return
  throw new Error('The Shop is not selling resales right now; this copy cannot be bought here.')
}
