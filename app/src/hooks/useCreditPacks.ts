import { useQuery } from '@tanstack/react-query'
import { CREDIT_PACKS, fetchCreditPacks, type CreditPack } from '~/lib/payments'

/**
 * The credit-pack catalogue, sourced from the credits-server (public GET /credits/packs — the single
 * source of truth). Falls back to the bundled CREDIT_PACKS so `packs` is ALWAYS populated: the buy
 * flow's no-funds pack pickers (BuyModal/Cart) render synchronously and never break before/without
 * the fetch, and the Get Credits grid degrades gracefully if the endpoint is unreachable. `isLoading`
 * is true only during the first fetch with no data yet — use it to show the pack skeletons.
 */
export function useCreditPacks(): { packs: CreditPack[]; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['credit-packs'],
    queryFn: fetchCreditPacks,
    staleTime: 5 * 60_000,
    // The bundled CREDIT_PACKS fallback keeps the buy flow working, so a failed fetch shouldn't
    // hammer the server — don't retry.
    retry: false
  })
  return { packs: data ?? CREDIT_PACKS, isLoading: isLoading && data === undefined }
}
