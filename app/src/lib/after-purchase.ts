import type { QueryClient } from '@tanstack/react-query'

/**
 * Everything that goes stale the moment a purchase settles, in one place.
 *
 * A settled buy changes three things at once: the buyer's credit balance, the item's listing /
 * availability, and the buyer's holdings. Miss a key and the UI lies — the PDP keeps offering a Buy CTA
 * for a token already bought, the item is absent from My Assets and Activity, and the homepage rail keeps
 * offering a last copy that just sold, all until the 30s staleTime lapses.
 *
 * This used to be two hand-maintained lists (the item Buy Now flow and the cart checkout). They agreed,
 * but only by inspection: adding a query key meant remembering both call sites, and whichever one was
 * forgotten would go stale silently. One function, one list.
 *
 * `item` scopes the three per-item keys when the caller bought exactly one thing. A basket spans many
 * items, so it omits the scope and invalidates those keys broadly — the same trade-off the two lists made
 * before, kept explicit here.
 */
export function invalidateAfterPurchase(
  qc: QueryClient,
  item?: { contractAddress: string; tokenId?: string; itemId?: string | null }
): void {
  const scoped = (key: string, ...parts: (string | null | undefined)[]) =>
    void qc.invalidateQueries({ queryKey: item ? [key, ...parts] : [key] })

  // The buyer's spendable balance.
  void qc.invalidateQueries({ queryKey: ['usd-balance'] })

  // This item's money + listing state.
  void qc.invalidateQueries({ queryKey: ['detail-trade'] })
  void qc.invalidateQueries({ queryKey: ['shop-item'] })
  scoped('owned-token', item?.contractAddress, item?.tokenId)
  scoped('public-token', item?.contractAddress, item?.tokenId)
  scoped('item-resales', item?.contractAddress, item?.itemId)

  // The grids that list it.
  void qc.invalidateQueries({ queryKey: ['shop-items'] })
  void qc.invalidateQueries({ queryKey: ['catalog-items'] })
  // The homepage featured rail and the cart cross-sell must drop a just-sold last copy rather than keep
  // offering it.
  void qc.invalidateQueries({ queryKey: ['overview-listings'] })
  void qc.invalidateQueries({ queryKey: ['upsell-listings'] })

  // Where it shows up now that it's theirs.
  void qc.invalidateQueries({ queryKey: ['my-assets'] })
  void qc.invalidateQueries({ queryKey: ['purchases'] })
  // The PDP's "You own N of this" note.
  void qc.invalidateQueries({ queryKey: ['owned-item-count'] })
}
