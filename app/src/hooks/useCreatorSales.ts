import { useQuery } from '@tanstack/react-query'
import { fetchCreatorSales, type CreatorSale } from '~/lib/coupons'

/**
 * A creator's sales with their last known on-chain state. Re-read every minute: the server's own poller
 * refreshes uses and cancellations on that cadence, so polling faster would only re-read the same answer.
 */
export function useCreatorSales(address: string | undefined, enabled = true) {
  return useQuery<CreatorSale[]>({
    queryKey: ['creator-sales', address?.toLowerCase()],
    queryFn: () => fetchCreatorSales(address as string),
    enabled: !!address && enabled,
    staleTime: 30_000,
    refetchInterval: 60_000
  })
}
