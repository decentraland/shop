import { useQuery } from '@tanstack/react-query'
import { fetchUnified } from '~/lib/api'
import { useWallet } from '~/store/wallet'

/**
 * How many listings the signed-in seller has open, of ANY currency.
 *
 * This exists so the migration section can be found by someone whose listings are ALREADY on the new
 * pricing: gating its chip on the migratable (MANA-priced) count alone hid the section from exactly the
 * seller who has nothing left to migrate, and hid the "you are all set" state with it.
 *
 * `/v3/catalog/unified` is one row per open trade and spans native (credits) and legacy (MANA) liquidity
 * alike, so one `first: 1` read answers "does this seller have listings" for both. Only the total is
 * used — the rows are thrown away.
 *
 * `creator`, not a seller filter, because the API has none: `/v3/catalog/importable` is the only endpoint
 * that takes `seller`. That makes this count exact for PRIMARY listings (a mint of an item you created is
 * your listing) and blind to resales of items someone else made. That gap is why this is additive rather
 * than a replacement — see Activity's `showMigrate`, which still ORs in the migratable count, so a
 * reseller keeps the chip they have today. Closing it properly wants a `seller` filter on the feed.
 *
 * `count` stays `undefined` until the answer is known, matching useImportable: a caller has to be able to
 * tell "none" from "not yet", or the chip flashes.
 */
export function useListingCount(): { count: number | undefined; isLoading: boolean } {
  const address = useWallet(s => s.session?.address)

  const { data, isLoading } = useQuery({
    queryKey: ['listing-count', address],
    queryFn: () => fetchUnified({ creator: address as string, onSale: true, first: 1 }),
    enabled: !!address,
    // Same window as useImportable. This changes only when the seller lists or takes something down, and
    // both of those invalidate their own keys; re-reading it per mount bought nothing.
    staleTime: 5 * 60_000
  })

  return { count: data?.total, isLoading }
}
