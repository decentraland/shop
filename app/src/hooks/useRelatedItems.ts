import { useQuery } from '@tanstack/react-query'

import { fetchRelatedItems, type UnifiedListing } from '~/lib/api'

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
  const { data, isFetched } = useQuery({
    queryKey: ['related-items', contractAddress, itemId, first],
    enabled: enabled && !!contractAddress && !!itemId,
    staleTime: 5 * 60_000,
    queryFn: () => fetchRelatedItems(contractAddress as string, itemId as string, { first })
  })

  return { items: data ?? [], isFetched }
}
