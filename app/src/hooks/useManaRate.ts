import { useQuery } from '@tanstack/react-query'
import { config } from '~/config'
import { readManaUsdRate, type ManaRate } from '~/lib/mana-rate'

// The live MANA→USD market rate, read from the on-chain oracle (see lib/mana-rate). Used by the
// Market tab to DISPLAY legacy (MANA-priced) listings in fluctuating credits. Refetched periodically
// so the indicative prices track the market; the final price is still locked at checkout.
//
// When the oracle is stale/down this query errors — the Market UI shows a notice and disables Buy Now
// rather than pricing off a bad rate.
export function useManaRate(enabled = true) {
  return useQuery<ManaRate>({
    queryKey: ['mana-rate', config.chainId],
    queryFn: () => readManaUsdRate(config.chainId),
    enabled, // the PDP only reads the oracle for a market-mode (legacy) item
    staleTime: 60_000, // the rate moves slowly; one read per minute is plenty
    refetchInterval: 60_000,
    retry: 1
  })
}
