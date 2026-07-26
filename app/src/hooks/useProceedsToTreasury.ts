import { useQuery } from '@tanstack/react-query'

import { getIsProceedsToTreasuryEnabled } from '~/lib/featureFlags'

/**
 * Whether sale proceeds are routed to the treasury (and the seller therefore credited in shop credits
 * instead of receiving MANA).
 *
 * This exists because the flag is not only a code path — it changes what the sell/list modals TELL the
 * seller they are going to receive. Reading it from build-time config alone would leave that copy stuck: kill
 * the flag and the modal would keep promising credits while the listing it signs pays MANA directly, which is
 * a false statement on a money screen.
 *
 * Returns `false` while loading and on error, matching the underlying fail-closed accessor: the honest
 * fallback is the pre-feature behaviour, and the copy that goes with it.
 */
export function useProceedsToTreasury(): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', 'proceeds-to-treasury'],
    queryFn: getIsProceedsToTreasuryEnabled,
    // The lib caches for 60s behind this; keeping react-query's window in step avoids two competing TTLs.
    staleTime: 60_000,
    // Re-check when the tab is focused again, so a flag flipped while the tab sat in the background is
    // picked up before the seller interacts rather than after they have signed.
    refetchOnWindowFocus: true,
    // A flag read is not worth retrying hard: fail closed and try again on the next natural read.
    retry: 1
  })

  return data === true
}
