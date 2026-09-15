import { useQuery } from '@tanstack/react-query'

import { getIsSecondaryPurchaseEnabled } from '~/lib/featureFlags'

/**
 * Whether the Shop may SELL a resale to this viewer: resales in the browse/search/trending feeds, the
 * PDP's lowest-price line and reseller list, a resale in the cart, and checkout.
 *
 * The BUYER's permission. Granted by either `shop-secondary-purchases` or the older
 * `shop-secondary-sales` (see `getIsSecondaryPurchaseEnabled`), and it never implies the seller's —
 * {@link useSecondaryListings} is the only thing that grants listing.
 *
 * Returns `false` while loading and on error: a slow flag read must not flash a resale the Shop may not
 * sell, and the kill switch has to mean off the moment the answer is in doubt.
 */
export function useSecondaryPurchases(): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', 'shop-secondary-purchases'],
    queryFn: getIsSecondaryPurchaseEnabled,
    // The lib caches for 60s behind this; keeping react-query's window in step avoids two competing TTLs.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  return data === true
}
