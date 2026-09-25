import { config } from '~/config'

/** One account holding a creator's items today, aggregated across all of that creator's collections. */
export type TopOwner = {
  address: string
  nfts: number
  items: number
  collections: number
  /** Milliseconds. */
  lastAcquiredAt: number
  /** MANA wei paid across every sale of the creator's items this account bought, first sales and resales. */
  spentWei: string
}

export type TopOwnersSort = 'nfts' | 'items' | 'collections' | 'recent' | 'spent'

/** The creator's catalogue is too large for the server to rank in time; the rest of the page is unaffected. */
export class TopOwnersUnavailableError extends Error {
  constructor() {
    super('fetchTopOwners 503')
  }
}

/**
 * A page of who holds a creator's items, from marketplace-server's /v1/owners/top.
 *
 * Not the same list as the buyers: this is who holds the items now, however they got them, and it does not
 * move with the page's period.
 */
export async function fetchTopOwners(
  creator: string,
  {
    sortBy,
    orderDirection,
    first,
    skip
  }: { sortBy?: TopOwnersSort; orderDirection?: 'asc' | 'desc'; first: number; skip: number }
): Promise<{ data: TopOwner[]; total: number }> {
  const qs = new URLSearchParams({ creator, first: String(first), skip: String(skip) })
  if (sortBy) qs.set('sortBy', sortBy)
  if (orderDirection) qs.set('orderDirection', orderDirection)
  const res = await fetch(`${config.marketplaceServerUrl}/v1/owners/top?${qs.toString()}`)
  if (!res.ok) {
    await res.body?.cancel()
    if (res.status === 503) throw new TopOwnersUnavailableError()
    throw new Error(`fetchTopOwners ${res.status}`)
  }
  const json = (await res.json()) as { data?: TopOwner[]; total?: number }
  return { data: json.data ?? [], total: json.total ?? 0 }
}
