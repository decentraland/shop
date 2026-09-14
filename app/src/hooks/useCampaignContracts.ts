import { useQuery } from '@tanstack/react-query'

import { fetchCampaignContracts } from '~/lib/campaign'

export type CampaignContractsQuery = {
  /** The event's collection addresses, lowercased. EMPTY means "this event selects nothing" — never "no filter". */
  contracts: string[]
  /** True while the tags are still being resolved. An empty list is only an answer once this is false. */
  isPending: boolean
  /** The builder could not be reached. Without this an outage is indistinguishable from an empty event. */
  isError: boolean
}

/**
 * The collection addresses a campaign's tags resolve to.
 *
 * Cached for an hour: a collection is tagged into an event by hand, days before it opens, so this changes
 * far less often than the CMS entry that points at it.
 *
 * The empty-vs-pending distinction in the return type is the whole point of this hook. An empty list is a
 * legitimate answer (an unknown tag, a tag nobody has applied yet) and it must render an empty grid, so a
 * caller that cannot tell it apart from "still loading" either flashes an empty state on every load or —
 * far worse — issues an unfiltered catalogue request and presents the entire Shop as the event.
 */
export function useCampaignContracts(tags: string[]): CampaignContractsQuery {
  const { data, isPending, isError } = useQuery({
    // Sorted so two orderings of the same tags share one cache entry.
    queryKey: ['campaign-contracts', [...tags].sort().join(',')],
    queryFn: () => fetchCampaignContracts(tags),
    enabled: tags.length > 0,
    staleTime: 60 * 60_000,
    retry: 1
  })

  return { contracts: data ?? [], isPending: tags.length > 0 && isPending, isError: tags.length > 0 && isError }
}
