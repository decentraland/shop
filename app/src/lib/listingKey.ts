import type { UnifiedListing } from '~/lib/api'

// A STABLE, UNIQUE React key for a card in the unified browse grid.
//
// The server `id` is the trade id, which is NOT a safe React key here: it can be empty for a row with
// no active trade, and the unified feed merges two liquidity sources (native + legacy), so the same
// underlying item can surface under both. A duplicate or empty key lets React reconcile a mounted card
// onto a DIFFERENT item on a filter/sort change — the card visibly "morphs" into another item instead
// of cleanly swapping. Compose the listing source with its trade/item identity so every row is
// distinct AND the key stays the same for the same listing across re-fetches (so React preserves the
// right card when results merely reorder).
export function listingKey(item: UnifiedListing): string {
  const identity = item.tradeId || `${item.contractAddress}-${item.tokenId ?? item.itemId ?? ''}`
  return `${item.source}:${identity}`
}
