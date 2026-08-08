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
    /**
     * Poll ONLY while some of the buyer's credits are held.
     *
     * Held dollars return on a server-side sweep — there is no client event behind it, so nothing else
     * would ever notice, and the balance would sit stale behind its own 30s staleTime while the buyer
     * stares at a number they know is wrong. The cadence matches the reconciler's own (15s), and it
     * stops the moment `held` is gone, so an ordinary session never polls at all.
     */
    refetchInterval: query => (query.state.data?.held ? 15_000 : false),
    queryFn: async (): Promise<UsdBalance> => getUsdBalance(session!.address, session!.identity)
  })
}

/**
 * Display label for a credit balance: show a dash when the balance fetch failed, so we don't render a
 * misleading `0` (which reads as "you have no credits") on a transient network error (U3). While
 * loading, `balance` is undefined and this shows `0` — acceptable; the dash is only for the error case.
 */
export function balanceLabel(balance: UsdBalance | undefined, isError: boolean): string | number {
  return isError ? '—' : (balance?.credits ?? 0)
}
