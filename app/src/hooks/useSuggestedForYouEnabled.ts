import { useQuery } from '@tanstack/react-query'

import { FeatureFlag, getIsFeatureEnabled } from '~/lib/featureFlags'

/**
 * Whether the Shop asks for personalised suggestions at all.
 *
 * Returns `false` while loading, on error and for the absent flag — the shipped default — so a slow
 * flag read never fires a request the release is not meant to make.
 */
export function useSuggestedForYouEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', 'shop-suggested-for-you'],
    queryFn: () => getIsFeatureEnabled(FeatureFlag.SHOP_SUGGESTED_FOR_YOU),
    // The lib caches for 60s behind this; keeping react-query's window in step avoids two competing TTLs.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  return data === true
}
