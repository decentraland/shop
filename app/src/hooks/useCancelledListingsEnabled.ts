import { useQuery } from '@tanstack/react-query'

import { FeatureFlag, getIsFeatureEnabled } from '~/lib/featureFlags'

/**
 * Whether the Shop tells an account about its taken-down listings and lists them.
 *
 * `false` while loading, on error and for the absent flag, so nothing is fetched or shown before it is on.
 */
export function useCancelledListingsEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', FeatureFlag.CANCELLED_ORDERS_BANNER],
    queryFn: () => getIsFeatureEnabled(FeatureFlag.CANCELLED_ORDERS_BANNER),
    // The lib caches for 60s behind this; keeping react-query's window in step avoids two competing TTLs.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  return data === true
}
