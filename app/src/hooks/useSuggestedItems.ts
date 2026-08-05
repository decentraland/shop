import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { CatalogItem } from '~/lib/api'
import { fetchCatalogItems, fetchCollectionItems } from '~/lib/collections'
import { useRelatedItems } from '~/hooks/useRelatedItems'
import { mergeSuggestions, SUGGESTIONS_TARGET, type SuggestionAnchor } from '~/lib/suggestions'

const COLLECTION_FIRST = 20
const CREATOR_FIRST = 30
const EMPTY: CatalogItem[] = []

/**
 * The PDP suggestions rail: the anchor's own collection first, padded with the creator's other items and
 * then with similar ones until it holds at least {@link SUGGESTIONS_TARGET} cards.
 *
 * The padding tiers are fetched in CASCADE — each enabled only once the previous has settled and come up
 * short — rather than in parallel: a collection big enough to fill the rail on its own must not spend two
 * extra requests per item view. The cost is a little latency below the fold, which is where this rail lives.
 *
 * `siblings` comes back raw because the page also uses the collection read to backfill an unhydrated item.
 */
export function useSuggestedItems(
  anchor: SuggestionAnchor & { creator?: string },
  target: number = SUGGESTIONS_TARGET
): {
  items: CatalogItem[]
  isCollectionOnly: boolean
  siblings: CatalogItem[]
  siblingsFetched: boolean
} {
  const { id, contractAddress, itemId, tokenId, creator } = anchor
  // The caller passes a fresh object every render; the merges below key off the identity fields only.
  const anchorKey = useMemo(() => ({ id, contractAddress, itemId, tokenId }), [id, contractAddress, itemId, tokenId])

  const { data: siblings = EMPTY, isFetched: siblingsFetched } = useQuery({
    queryKey: ['collection-items', contractAddress],
    enabled: !!contractAddress,
    queryFn: () => fetchCollectionItems(contractAddress as string, { first: COLLECTION_FIRST }).then(r => r.items)
  })

  const collectionCount = useMemo(
    () => mergeSuggestions({ collection: siblings }, anchorKey, target).items.length,
    [siblings, anchorKey, target]
  )
  const needsPadding = siblingsFetched && collectionCount < target

  // On-sale only: a rail padded with unbuyable cards does not help discovery, and the related tier below is
  // on-sale-only server-side anyway.
  const creatorEnabled = needsPadding && !!creator
  const creatorQuery = useQuery({
    queryKey: ['suggestions-creator', creator],
    enabled: creatorEnabled,
    staleTime: 5 * 60_000,
    queryFn: () => fetchCatalogItems({ creator, isOnSale: true, first: CREATOR_FIRST }).then(r => r.items)
  })
  const creatorItems = creatorQuery.data ?? EMPTY
  const creatorSettled = !creatorEnabled || creatorQuery.isSuccess || creatorQuery.isError

  const withCreatorCount = useMemo(
    () => mergeSuggestions({ collection: siblings, creator: creatorItems }, anchorKey, target).items.length,
    [siblings, creatorItems, anchorKey, target]
  )

  const { items: related } = useRelatedItems(contractAddress, itemId ?? null, {
    enabled: needsPadding && creatorSettled && withCreatorCount < target,
    first: target
  })

  const merged = useMemo(
    () => mergeSuggestions({ collection: siblings, creator: creatorItems, related }, anchorKey, target),
    [siblings, creatorItems, related, anchorKey, target]
  )

  return { ...merged, siblings, siblingsFetched }
}
