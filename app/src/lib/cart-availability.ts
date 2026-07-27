import type { Trade } from '@dcl/schemas'
import { resolveLiveTrade, usdWeiToCents, TradeNotFoundError, type CatalogItem } from '~/lib/api'

// A cart line's live sellability, checked when the cart opens.
//   available   → the underlying listing still resolves and is buyable
//   sold-out    → a PRIMARY (mint) line whose supply is exhausted / minting closed (no live listing)
//   unavailable → a SECONDARY (unique token) line whose listing is gone, or any expired / $0 listing
// We never block render on this: a line is assumed 'available' until proven otherwise (see the hook),
// so a non-available state is only ever reported once the line's live trade has actually resolved (or
// definitively failed to resolve).
export type CartLineAvailability = 'available' | 'sold-out' | 'unavailable'

// Can this line still be bought? Anything other than 'available' (and the optimistic "not yet known"
// undefined) is excluded from the total and from checkout. Kept as one predicate so the cart UI and
// the total/CTA logic agree on exactly one definition of "buyable".
export function isLineBuyable(status: CartLineAvailability | undefined): boolean {
  return status === undefined || status === 'available'
}

// Classify a line against its freshly-resolved live trade (or null when no live listing exists).
// Mirrors the availability half of reviewCart so what the cart SHOWS agrees with what checkout DOES:
// no live listing / a past expiration / a zero price all mean "not buyable". A PRIMARY (mint) line
// with no live listing reads as sold-out; a SECONDARY (unique token) line reads as unavailable.
export function classifyTrade(item: Pick<CatalogItem, 'tokenId'>, trade: Trade | null): CartLineAvailability {
  if (!trade) return item.tokenId ? 'unavailable' : 'sold-out'
  // checks.expiration is stored in epoch MILLISECONDS (see lib/trade-encoding.ts), so it compares
  // directly against Date.now(). Only treat a real, positive, past timestamp as expired.
  const expiration = (trade.checks as { expiration?: number } | undefined)?.expiration
  if (typeof expiration === 'number' && Number.isFinite(expiration) && expiration > 0 && expiration <= Date.now()) {
    return 'unavailable'
  }
  const usdCents = usdWeiToCents((trade.received?.[0] as { amount?: string } | undefined)?.amount)
  if (!Number.isFinite(usdCents) || usdCents <= 0) return 'unavailable'
  return 'available'
}

// Resolve a single cart line's current availability. Reuses resolveLiveTrade — the exact resolver
// checkout uses — so the cart's judgement matches the basket review. A definitively-missing trade
// (a TradeNotFoundError with no item fallback, i.e. a sold/cancelled secondary token) classifies as
// not-available rather than throwing; any OTHER failure (network, 5xx) propagates so the caller can
// stay optimistic instead of caching a false "unavailable".
export async function resolveLineAvailability(
  item: Pick<CatalogItem, 'tradeId' | 'tokenId' | 'itemId' | 'contractAddress'>
): Promise<CartLineAvailability> {
  try {
    const trade = await resolveLiveTrade(item)
    return classifyTrade(item, trade)
  } catch (e) {
    if (e instanceof TradeNotFoundError) return item.tokenId ? 'unavailable' : 'sold-out'
    throw e
  }
}
