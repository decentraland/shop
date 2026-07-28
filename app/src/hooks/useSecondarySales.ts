import { useQuery } from '@tanstack/react-query'

import { getIsSecondarySalesEnabled } from '~/lib/featureFlags'

/**
 * Whether the Shop offers secondary sales (resales): buying a listed token, and listing an owned one.
 *
 * Returns `false` while loading and on error. That is deliberate and, unlike most fail-closed reads, it is
 * also the product default — a slow flag read must not flash a Sell button that is not supposed to be
 * there.
 */
export function useSecondarySales(): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', 'shop-secondary-sales'],
    queryFn: getIsSecondarySalesEnabled,
    // The lib caches for 60s behind this; keeping react-query's window in step avoids two competing TTLs.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  return data === true
}
