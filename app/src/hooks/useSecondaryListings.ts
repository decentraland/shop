import { useQuery } from '@tanstack/react-query'

import { getIsSecondaryListingEnabled } from '~/lib/featureFlags'

/**
 * Whether this viewer may CREATE a secondary listing: sell an owned token, migrate one from the classic
 * Marketplace, or re-price one.
 *
 * The SELLER's permission, and only that. Buying a resale is {@link useSecondaryPurchases} — two hooks over
 * two flags, so a surface cannot ask the wrong question and a permission to buy cannot grant one to sell.
 *
 * Returns `false` while loading and on error. That is deliberate and, unlike most fail-closed reads, it is
 * also the product default — a slow flag read must not flash a Sell button that is not supposed to be
 * there.
 */
export function useSecondaryListings(): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', 'shop-secondary-sales'],
    queryFn: getIsSecondaryListingEnabled,
    // The lib caches for 60s behind this; keeping react-query's window in step avoids two competing TTLs.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  return data === true
}
