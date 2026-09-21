import { config } from '~/config'

// ---------------------------------------------------------------------------
// Multi-entity search for the search-bar suggestions dropdown.
//
// The item GRID search (see lib/api.ts fetchListings → /v3/catalog/shop) already covers item
// name + tags server-side. This module adds the two entity types the grid can't surface as
// dedicated rows: COLLECTIONS and CREATORS. The dropdown stacks all three as one vertical list;
// the grid stays items-only.
//
// - Collections: the indexer's GET /v1/collections?search=<name> matches collection name and
//   returns { name, contractAddress, creator }.
// - Creators: the server's GET /v3/catalog/creators/search matches a creator's profile name and the
//   NAMEs they hold, ranked, and answers with the display name + avatar — so "search by author"
//   finds authors even when no item/collection name matches. It replaced three calls (names →
//   owners → seller check → profiles) whose first step came back unranked and cut off the exact
//   match. ("NAMEs" is internal plumbing — the UI only ever says "Creators".)
// ---------------------------------------------------------------------------

export type CollectionHit = {
  contractAddress: string
  name: string
  creator: string
}

export type CreatorHit = {
  address: string
  name: string
  face?: string
}

type RawCollection = {
  contractAddress: string
  name: string
  creator: string
}

// Matching collections by name. Small page — this feeds a preview dropdown, not a grid.
export async function fetchCollectionSuggestions(search: string, first = 4): Promise<CollectionHit[]> {
  const qs = new URLSearchParams({ search, first: String(first) })
  const res = await fetch(`${config.marketplaceServerUrl}/v1/collections?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCollectionSuggestions ${res.status}`)
  const { data } = (await res.json()) as { data?: RawCollection[] }
  return (data ?? [])
    .filter(c => c.contractAddress && c.name)
    .map(c => ({ contractAddress: c.contractAddress, name: c.name, creator: c.creator ?? '' }))
}

type RawCreator = {
  address: string
  name: string
  face?: string | null
}

// Creators matching the query by profile name or by a NAME they hold, ranked by the server
// (GET /v3/catalog/creators/search). One call: the server keeps a table of every creator with an
// approved collection, so "is a seller" holds by construction and nothing gates it here.
export async function fetchCreatorSuggestions(search: string, first = 4): Promise<CreatorHit[]> {
  const term = search.trim()
  if (!term) return []
  const qs = new URLSearchParams({ search: term, first: String(first) })
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/creators/search?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCreatorSuggestions ${res.status}`)
  const { data } = (await res.json()) as { data?: RawCreator[] }
  return (data ?? [])
    .filter(c => c.address && c.name)
    .map(c => ({ address: c.address.toLowerCase(), name: c.name, face: c.face ?? undefined }))
}
