import { useQuery } from '@tanstack/react-query'
import type { Session } from '~/lib/auth'
import { readManaBalanceWei } from '~/lib/mana'

// The signed-in user's on-chain MANA balance in wei. Used by the Buy Now flow to decide whether to
// OFFER paying directly with MANA (only shown when the balance is > 0). Cheap read-only RPC call,
// cached 30s like useBalance; invalidate ['mana-balance'] after a MANA purchase to refetch.
export function useManaBalance(session: Session | null) {
  return useQuery({
    queryKey: ['mana-balance', session?.address],
    enabled: !!session,
    staleTime: 30_000,
    queryFn: async (): Promise<bigint> => readManaBalanceWei(session!.address, session!.chainId)
  })
}
