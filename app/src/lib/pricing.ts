/**
 * Whether a listing row is FOR SALE at all, independent of how it is bought.
 *
 * `tradeId` is not the answer, and assuming it was is what made the item page say NOT FOR SALE about an
 * item the browse grid was selling from the same feed. A collection-store mint (`acquisition: 'store'`)
 * has no trade and never will — it is minted straight from the store contract — yet it has stock, a price,
 * and a working purchase path (see lib/cart-checkout, which already routes it).
 *
 * The credit PRICE of such a row is a separate question, answered by `displayCredits` in lib/mana-convert:
 * a store mint is MANA-denominated, so its price is the live conversion, never the server's snapshot.
 */
export function isListingForSale(row: {
  tradeId?: string | null
  acquisition?: 'trade' | 'store' | null
  available?: number | null
}): boolean {
  if (row.acquisition === 'store') return (row.available ?? 0) > 0
  return !!row.tradeId
}
