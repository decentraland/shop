import { useQuery } from '@tanstack/react-query'

import { FeatureFlag, getIsFeatureEnabled } from '~/lib/featureFlags'

/**
 * Whether the Shop shows creator follows (the Follow button and the followed-creators row).
 *
 * Returns `false` while loading, on error and for the absent flag — which is also the shipped default, so a
 * slow flag read never flashes a Follow button the release is not meant to have.
 */
export function useFollowsEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', 'shop-follows'],
    queryFn: () => getIsFeatureEnabled(FeatureFlag.SHOP_FOLLOWS),
    // The lib caches for 60s behind this; keeping react-query's window in step avoids two competing TTLs.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  return data === true
}
