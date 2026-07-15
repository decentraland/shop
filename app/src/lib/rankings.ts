import { config } from '~/config'

// Creator rankings (marketplace-server /v1/rankings). Powers the Overview "Week Top Creators" table.
// The route lives on the MARKETPLACE server (not the NFT/indexer base) — confirmed against
// {config.marketplaceServerUrl}/v1/rankings/creators/week. Response is wrapped in `{ data: [...] }`.
//
// A single creator's ranking row. `earned` is MANA in wei (18 decimals) — the total volume the
// creator earned in the timeframe; the UI formats it to whole MANA (see WeekTopCreators).
export type CreatorRank = {
  id: string // wallet address
  sales: number
  earned: string // MANA wei
  collections: number
  uniqueCollectors: number
}

export type RankingsPeriod = 'day' | 'week' | 'month' | 'all'
export type CreatorSortBy = 'most_sales' | 'most_volume'

// Top creators for a timeframe (default: this week, by volume). Mirrors the fetch/error pattern used
// across lib/api.ts — throws on a non-OK response so React Query surfaces it as an error state.
export async function fetchTopCreators(
  period: RankingsPeriod = 'week',
  first = 10,
  sortBy: CreatorSortBy = 'most_volume'
): Promise<CreatorRank[]> {
  const qs = new URLSearchParams({ sortBy, first: String(first) })
  const res = await fetch(`${config.marketplaceServerUrl}/v1/rankings/creators/${period}?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchTopCreators ${res.status}`)
  const json = (await res.json()) as { data?: CreatorRank[] }
  return json.data ?? []
}
