import { useQuery } from '@tanstack/react-query'
import { fetchCancelledTrades, type CancelledTrade } from '~/lib/cancelled-trades'
import { getIsCancelledListingsEnabled } from '~/lib/featureFlags'
import { useWallet } from '~/store/wallet'

const EMPTY: CancelledTrade[] = []

/**
 * The signed-in account's listings and offers taken down by the marketplace upgrade, behind its flag.
 * `count` stays `undefined` until known, so callers render nothing rather than flash a zero.
 */
export function useCancelledTrades(): { trades: CancelledTrade[]; count: number | undefined } {
  const session = useWallet(s => s.session)
  const address = session?.address

  const { data: enabled } = useQuery({
    queryKey: ['feature-flag', 'shop-cancelled-listings'],
    queryFn: getIsCancelledListingsEnabled,
    staleTime: 60_000,
    retry: 1
  })

  const { data } = useQuery({
    queryKey: ['cancelled-trades', address],
    queryFn: () => fetchCancelledTrades(session!.identity),
    enabled: enabled === true && !!address,
    staleTime: 5 * 60_000
  })

  return { trades: data ?? EMPTY, count: data?.length }
}
