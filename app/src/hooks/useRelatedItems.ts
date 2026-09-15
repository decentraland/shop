import { useQuery } from '@tanstack/react-query'

import { fetchRelatedItems, type UnifiedListing } from '~/lib/api'
import { useSecondaryPurchases } from '~/hooks/useSecondaryPurchases'

/**
 * Items similar to one item, for the PDP's fallback rail.
 *
 * `enabled` is a parameter rather than something derived here because only the caller knows whether the rail
 * is needed at all: the PDP prefers the item's own collection and asks for this only once it knows that
 * collection has nothing else on sale. Fetching eagerly would spend a request on every item detail view.
 *
 * Similarity is not money-sensitive, so this keeps a generous stale window instead of revalidating on
 * remount/focus the way the listing and trade reads on that page do.
 */
export function useRelatedItems(
  contractAddress: string | undefined,
  itemId: string | null,
  { enabled = true, first }: { enabled?: boolean; first?: number } = {}
): { items: UnifiedListing[]; isFetched: boolean } {
  // The rail is meant to be indistinguishable from the browse grid, so it is drawn from the same universe:
  // with resales on sale, a Marketplace-listed copy can be the only liquidity an otherwise sold-out
  // neighbour has, and leaving it out would show the rail a stale, primary-only version of the catalogue.
  const secondaryPurchases = useSecondaryPurchases()

  const { data, isFetched } = useQuery({
    queryKey: ['related-items', contractAddress, itemId, first, secondaryPurchases],
    enabled: enabled && !!contractAddress && !!itemId,
    staleTime: 5 * 60_000,
    queryFn: () =>
      fetchRelatedItems(contractAddress as string, itemId as string, {
        first,
        includeLegacySecondary: secondaryPurchases,
        // Not only the legacy opt-in: NATIVE resales reach this feed unconditionally and their orders are
        // durable, so a rail that may not sell one has to ask for mints explicitly.
        listingType: secondaryPurchases ? undefined : 'primary'
      })
  })

  return { items: data ?? [], isFetched }
}
