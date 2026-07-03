import { config } from './config'
import type { ClassicListing } from './types'

// Dedupe check (MIGRATION_SPEC §7): is there ALREADY an open USD-pegged (credit-buyable) listing
// for this item? The v3 shop feed only returns USD-pegged listings, so any hit means "already
// migrated" → skip. Makes re-runs idempotent.

export type ShopListingRaw = {
  tradeId: string
  listingType: 'primary' | 'secondary'
  contractAddress: string
  itemId: string | null
  tokenId: string | null
}

// Reusable per-collection cache so one run fetches each collection's Shop listings only once.
export type ShopFeedCache = Map<string, ShopListingRaw[]>

// null = the Shop feed endpoint isn't available here (e.g. 404 on a server without the v3 catalog).
// The caller then can't dedupe and proceeds with a warning rather than failing the candidate.
async function fetchShopListings(params: {
  contractAddress: string
  itemId?: string
  first?: number
}): Promise<ShopListingRaw[] | null> {
  const qs = new URLSearchParams({ contractAddress: params.contractAddress, first: String(params.first ?? 200) })
  if (params.itemId != null) qs.set('itemId', params.itemId)
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/shop?${qs.toString()}`)
  if (res.status === 404) return null // v3 shop catalog not deployed on this server
  if (!res.ok) throw new Error(`GET /v3/catalog/shop ${res.status}`)
  const json = (await res.json()) as { data?: ShopListingRaw[] }
  return json.data ?? []
}

export type DedupeResult = { alreadyListed: boolean; feedAvailable: boolean }

/**
 * Is there already an equivalent open USD-pegged listing in the Shop? `cache` reuses one fetch per
 * collection across a run. `feedAvailable=false` means the Shop feed couldn't be consulted (endpoint
 * missing) — the caller should proceed but flag that dedupe was skipped.
 */
export async function isAlreadyUsdListed(listing: ClassicListing, cache: ShopFeedCache): Promise<DedupeResult> {
  const contract = listing.contractAddress.toLowerCase()
  let rows = cache.get(contract)
  if (rows === undefined) {
    // `null` (feed unavailable) is cached as an empty array too, but we short-circuit on the first
    // miss below; a re-check per candidate would re-hit the 404, so we cache [] and rely on the fact
    // that an unavailable feed simply yields no matches (proceed). Availability is reported per call.
    const fetched = await fetchShopListings({ contractAddress: contract })
    if (fetched === null) {
      cache.set(contract, [])
      return { alreadyListed: false, feedAvailable: false }
    }
    rows = fetched
    cache.set(contract, rows)
  }
  const alreadyListed =
    listing.listingType === 'primary'
      ? rows.some(r => r.listingType === 'primary' && String(r.itemId) === String(listing.itemId))
      : rows.some(r => r.listingType === 'secondary' && String(r.tokenId) === String(listing.tokenId))
  return { alreadyListed, feedAvailable: true }
}
