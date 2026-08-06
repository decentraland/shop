import { useQuery } from '@tanstack/react-query'

import { FeatureFlag, getIsFeatureEnabled } from '~/lib/featureFlags'

/**
 * Whether a NAME can be registered with credits.
 *
 * Returns `false` while loading, on error and for the absent flag — which is also the shipped default, so a
 * slow flag read never flashes a Claim button that would fail: credits-server refuses the route under the
 * same flag, and by then the user has already picked a name.
 *
 * Gates the PURCHASE only. Searching a NAME does not depend on this.
 */
export function useNamesEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', 'shop-names'],
    queryFn: () => getIsFeatureEnabled(FeatureFlag.SHOP_NAMES),
    // The lib caches for 60s behind this; keeping react-query's window in step avoids two competing TTLs.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  return data === true
}
