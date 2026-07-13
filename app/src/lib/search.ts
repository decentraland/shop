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
// - Creators: there is NO creator-name search endpoint. Mirroring the marketplace webapp, we
//   search DCL *names* (GET /v1/nfts?category=ens&search=<name>), take each name's owner address,
//   keep the ones that are actually sellers (GET /accounts → collections > 0), and resolve each to
//   a display name + avatar (peer lambdas profile). The matched name is the display name (falling
//   back to the profile name), so "search by author" finds authors even when no item/collection
//   name matches. ("ENS"/"names" is internal plumbing — the UI only ever says "Creators".)
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
  const res = await fetch(`${config.nftApiUrl}/v1/collections?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchCollectionSuggestions ${res.status}`)
  const { data } = (await res.json()) as { data?: RawCollection[] }
  return (data ?? [])
    .filter(c => c.contractAddress && c.name)
    .map(c => ({ contractAddress: c.contractAddress, name: c.name, creator: c.creator ?? '' }))
}

type EnsNft = { nft?: { name?: string; owner?: string } }
type Account = { address: string; collections?: number }
type ProfileAvatar = { name?: string; avatar?: { snapshots?: { face256?: string } } }

// The DCL names that match the query → their owner addresses, paired with the matched name (used as
// the creator's display name). First name wins per owner (names come back best-match first).
async function fetchNameOwners(search: string, first: number): Promise<Map<string, string>> {
  const qs = new URLSearchParams({ category: 'ens', search, first: String(first) })
  const res = await fetch(`${config.nftApiUrl}/v1/nfts?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchNameOwners ${res.status}`)
  const { data } = (await res.json()) as { data?: EnsNft[] }
  const owners = new Map<string, string>()
  for (const row of data ?? []) {
    const owner = row.nft?.owner?.toLowerCase()
    const name = row.nft?.name
    if (owner && name && !owners.has(owner)) owners.set(owner, name)
  }
  return owners
}

// Of the given addresses, which are actual sellers (have published collections). Returns the set of
// address → collections count for those with count > 0.
async function fetchSellerCounts(addresses: string[]): Promise<Map<string, number>> {
  if (addresses.length === 0) return new Map()
  const qs = new URLSearchParams({ sortBy: 'most_collections' })
  for (const a of addresses) qs.append('address', a)
  const res = await fetch(`${config.nftApiUrl}/v1/accounts?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchSellerCounts ${res.status}`)
  const { data } = (await res.json()) as { data?: Account[] }
  const counts = new Map<string, number>()
  for (const a of data ?? []) {
    if ((a.collections ?? 0) > 0) counts.set(a.address.toLowerCase(), a.collections ?? 0)
  }
  return counts
}

async function fetchProfile(address: string): Promise<ProfileAvatar | undefined> {
  const res = await fetch(`${config.peerUrl}/lambdas/profiles/${address.toLowerCase()}`)
  if (!res.ok) return undefined
  const profile = (await res.json()) as { avatars?: ProfileAvatar[] }
  return profile?.avatars?.[0]
}

// Creators matching the query by DCL name: name-search → owners → seller gate → profile resolve.
// `nameFirst` bounds the name lookup; `first` caps the rows shown.
export async function fetchCreatorSuggestions(search: string, first = 4, nameFirst = 20): Promise<CreatorHit[]> {
  const term = search.trim()
  if (!term) return []

  const owners = await fetchNameOwners(term, nameFirst)
  if (owners.size === 0) return []

  const sellers = await fetchSellerCounts([...owners.keys()])
  const addresses = [...owners.keys()].filter(a => sellers.has(a)).slice(0, first)
  if (addresses.length === 0) return []

  return Promise.all(
    addresses.map(async address => {
      const profile = await fetchProfile(address)
      // Prefer the profile's display name; fall back to the matched DCL name.
      return {
        address,
        name: profile?.name || (owners.get(address) ?? address),
        face: profile?.avatar?.snapshots?.face256,
      }
    })
  )
}
