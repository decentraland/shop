import { useQuery } from '@tanstack/react-query'
import type { Session } from '~/lib/auth'
import { getUsdBalance, type UsdBalance } from '~/lib/credits'

// The signed-in user's spendable USD credit balance (1 credit = $0.10). Shown in the sub-nav +
// cart; invalidate ['usd-balance'] after a top-up or a purchase to refetch.
export function useBalance(session: Session | null) {
  return useQuery({
    queryKey: ['usd-balance', session?.address],
    enabled: !!session,
    staleTime: 30_000,
    queryFn: async (): Promise<UsdBalance> => getUsdBalance(session!.address, session!.identity)
  })
}
