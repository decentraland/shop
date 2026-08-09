import { useQuery } from '@tanstack/react-query'
import type { Session } from '~/lib/auth'
import { getUsdBalance, type UsdBalance } from '~/lib/credits'

// The signed-in user's spendable USD credit balance (1 credit = $0.10). Shown in the sub-nav +
// cart; invalidate ['usd-balance'] after a top-up or a purchase to refetch.
// Matches the credits-server reconciler's own cadence: polling faster cannot make the money return sooner.
const POLL_MS = 15_000

export function useBalance(session: Session | null) {
  return useQuery({
    queryKey: ['usd-balance', session?.address],
    enabled: !!session,
    staleTime: 30_000,
    /**
     * Poll ONLY while some of the buyer's credits are held, and AIM the next poll at the moment the money
     * can actually come back.
     *
     * Held dollars return on a server-side sweep — there is no client event behind it, so nothing else
     * would ever notice, and the balance would sit stale behind its own 30s staleTime while the buyer
     * stares at a number they know is wrong.
     *
     * A flat cadence would leave the buyer watching a countdown hit zero and then wait up to another full
     * interval to learn anything, at the one moment they are most likely to be looking. So while an
     * estimate is still in the future the next poll is scheduled just past it; everything else — no
     * estimate, or an estimate already gone by — falls back to the reconciler's own 15s cadence. Polling
     * stops entirely the moment `held` is absent, so an ordinary session never polls at all.
     */
    refetchInterval: query => {
      const held = query.state.data?.held
      if (!held) return false
      const eta = held.releasesAtSeconds
      if (eta == null) return POLL_MS
      // +1s so the poll lands after the moment, never a tick before it.
      const untilDue = eta * 1000 - Date.now() + 1_000
      return untilDue > 0 ? Math.min(untilDue, POLL_MS) : POLL_MS
    },
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
