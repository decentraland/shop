import signedFetch from 'decentraland-crypto-fetch'
import { Rarity } from '@dcl/schemas'
import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'
import { captureError } from '~/lib/monitoring'

// builder-server client (READ-ONLY). Enumerates the creator's published collections and their
// publishable items so the Shop can offer them for PRIMARY sale. Listing itself does NOT POST here
// (that's a signed trade → marketplace-server, see lib/trades.createPrimaryUsdPeggedListing).
//
// Auth is ADR-44 signed-fetch as the creator (same identity as lib/credits.getUserCredits). The
// address-scoped route requires authenticated address == the path :address.

const BUILDER_V1 = () => `${config.builderServerUrl}/v1`

// ---------------------------------------------------------------------------
// Raw server shapes (only the fields we read)
// ---------------------------------------------------------------------------

type RawCollection = {
  id: string // builder UUID
  name: string
  eth_address: string
  contract_address: string | null // on-chain collection address (null until published)
  is_published: boolean
  is_approved: boolean
  minters?: string[] // addresses allowed to mint (see minter prereq)
  salt?: string | null
}

type RawItem = {
  id: string // builder UUID (NOT the on-chain id)
  collection_id: string
  contract_address?: string | null
  blockchain_item_id: string | null // the on-chain item index ("0","1",…) — the trade's itemId
  name: string
  description?: string
  // The builder returns `thumbnail` as a FILENAME (e.g. "thumbnail.png"), not a URL — resolve it to a
  // storage URL via the `contents` map (filename → content hash). See resolveThumbnail.
  thumbnail?: string
  contents?: Record<string, string>
  is_published?: boolean
  is_approved?: boolean
  total_supply?: string | number // already minted
  rarity?: string
  type?: 'wearable' | 'emote'
  data?: {
    category?: string
    wearable?: { category?: string }
    emote?: { category?: string }
  }
}

// Server may return a paginated envelope OR a bare array depending on the route/version.
type Paginated<T> = { results: T[] } | { data: T[] } | T[]

function unwrap<T>(payload: Paginated<T>): T[] {
  if (Array.isArray(payload)) return payload
  if ('results' in payload && Array.isArray(payload.results)) return payload.results
  if ('data' in payload && Array.isArray(payload.data)) return payload.data
  return []
}

// ---------------------------------------------------------------------------
// Clean types the UI works with
// ---------------------------------------------------------------------------

export type CreatorCollection = {
  id: string // builder UUID (used to fetch items)
  name: string
  contractAddress: string // on-chain collection address (non-null: we only surface published ones)
  isPublished: boolean
  isApproved: boolean
  minters: string[]
}

export type PublishableItem = {
  id: string // builder UUID
  collectionId: string
  collectionName: string
  contractAddress: string // on-chain collection address
  blockchainItemId: string // the on-chain item index — the trade's itemId
  name: string
  category: string
  rarity: string
  thumbnail: string
  type: 'wearable' | 'emote'
  isPublished: boolean
  isApproved: boolean
  totalSupply: number
  maxSupply: number
  remainingSupply: number
  // The list of addresses allowed to mint this item's collection (from the parent collection).
  // Used by the UI to decide whether primary sales are already enabled (minter prereq).
  minters: string[]
}

async function getJson<T>(url: string, identity: AuthIdentity): Promise<T> {
  const res = await signedFetch(url, { method: 'GET', identity, metadata: {} })
  if (!res.ok) throw new Error(`builder-server ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { ok?: boolean; data?: T } | T
  // builder-server wraps most responses in { ok, data }.
  return ((json as { data?: T }).data ?? json) as T
}

function toRemaining(total: number, max: number): number {
  const rem = max - total
  return rem > 0 ? rem : 0
}

function categoryOf(item: RawItem): string {
  return item.data?.wearable?.category ?? item.data?.emote?.category ?? item.data?.category ?? item.type ?? 'wearable'
}

// Builder content is served at /v1/storage/contents/{hash} (see marketplace webapp builder API).
function contentUrl(hash: string): string {
  return `${BUILDER_V1()}/storage/contents/${hash}`
}

// Resolve a filename (or already-a-hash / already-a-URL) to a loadable image URL using a contents map.
function fromContents(name: string | undefined, contents: Record<string, string> | undefined): string {
  if (!name) return ''
  if (/^https?:\/\//.test(name)) return name // already a full URL
  const hash = contents?.[name]
  if (hash) return contentUrl(hash)
  if (/^(ba|Qm)/.test(name)) return contentUrl(name) // name is itself a content hash
  return ''
}

// Public (no-auth) fallback: fetch a published item's contents map by on-chain address + item id.
async function fetchItemContents(contractAddress: string, itemId: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${BUILDER_V1()}/items/${contractAddress}/${itemId}/contents`)
    if (!res.ok) return {}
    const json = (await res.json()) as { data?: Record<string, string> } | Record<string, string>
    return ((json as { data?: Record<string, string> }).data ?? json) as Record<string, string>
  } catch {
    return {}
  }
}

// A creator may ship a showcase clip alongside a smart wearable's assets. The builder stores it as an
// ordinary content entry, so the only thing that marks it is the file name.
const VIDEO_FILE = 'video.mp4'

/**
 * The item's SHOWCASE VIDEO as a playable URL, or null when its creator did not upload one — which is the
 * common case, including for every non-smart item. Same source the marketplace reads (its
 * getSmartWearableVideoShowcase): the builder's per-item contents map, keyed by file name, resolved to a
 * storage URL by hash. Nested paths count (`male/video.mp4`), hence the suffix match rather than a lookup.
 *
 * Fail-soft by construction: fetchItemContents swallows transport errors into an empty map, and an empty map
 * means no video. A missing clip must never take the item page down with it.
 */
export async function fetchItemVideoUrl(contractAddress: string, itemId: string): Promise<string | null> {
  const contents = await fetchItemContents(contractAddress, itemId)
  const key = Object.keys(contents).find(name => name.endsWith(VIDEO_FILE))
  return key ? contentUrl(contents[key]) : null
}

/**
 * The item's thumbnail as a loadable URL. The builder returns `thumbnail` as a filename, so we map it
 * through the item's `contents` (filename → hash). Falls back to the public per-item contents endpoint
 * when the list response omits `contents` (all shown items are published, so it's available).
 */
async function resolveThumbnail(raw: RawItem, contractAddress: string, blockchainItemId: string): Promise<string> {
  const inline = fromContents(raw.thumbnail, raw.contents) || fromContents('thumbnail.png', raw.contents)
  if (inline) return inline
  if (contractAddress && blockchainItemId) {
    const map = await fetchItemContents(contractAddress, blockchainItemId)
    return fromContents(raw.thumbnail, map) || fromContents('thumbnail.png', map) || fromContents('image.png', map)
  }
  return ''
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** The creator's on-chain (published) collections. Signed as the creator. */
export async function fetchCreatorCollections(address: string, identity: AuthIdentity): Promise<CreatorCollection[]> {
  const url = `${BUILDER_V1()}/${address.toLowerCase()}/collections?is_published=true`
  const payload = await getJson<Paginated<RawCollection>>(url, identity)
  return unwrap(payload)
    .filter(c => c.is_published && !!c.contract_address)
    .map(c => ({
      id: c.id,
      name: c.name,
      contractAddress: (c.contract_address as string).toLowerCase(),
      isPublished: c.is_published,
      isApproved: c.is_approved,
      minters: (c.minters ?? []).map(m => m.toLowerCase())
    }))
}

/** One raw builder item → the Shop's publishable shape, supplied and priced from its collection. */
async function toPublishableItem(raw: RawItem, collection: CreatorCollection): Promise<PublishableItem> {
  const rarity = raw.rarity ?? 'common'
  const total = Number(raw.total_supply ?? 0) || 0
  let max: number
  try {
    max = Rarity.getMaxSupply(rarity as Rarity)
  } catch {
    max = 0
  }
  const contractAddress = (raw.contract_address ?? collection.contractAddress).toLowerCase()
  const blockchainItemId = raw.blockchain_item_id ?? ''
  return {
    id: raw.id,
    collectionId: collection.id,
    collectionName: collection.name,
    contractAddress,
    blockchainItemId,
    name: raw.name,
    category: categoryOf(raw),
    rarity,
    thumbnail: await resolveThumbnail(raw, contractAddress, blockchainItemId),
    type: raw.type ?? 'wearable',
    isPublished: raw.is_published ?? collection.isPublished,
    isApproved: raw.is_approved ?? collection.isApproved,
    totalSupply: total,
    maxSupply: max,
    remainingSupply: toRemaining(total, max),
    minters: collection.minters
  }
}

/** The publishable items inside one collection (only those ready for a primary listing). */
export async function fetchCollectionItems(
  collection: CreatorCollection,
  identity: AuthIdentity,
  /**
   * Keep the items whose supply has run out. Off by default, because every caller that asks "what can I
   * list / mint / discount" means the publishable ones — but the creator's own inventory is not one of
   * those questions, and dropping a sold-out item there reads as the item having gone missing.
   */
  opts?: { includeSoldOut?: boolean }
): Promise<PublishableItem[]> {
  const url = `${BUILDER_V1()}/collections/${collection.id}/items`
  const payload = await getJson<Paginated<RawItem>>(url, identity)
  const items = await Promise.all(unwrap(payload).map(raw => toPublishableItem(raw, collection)))
  return items.filter(opts?.includeSoldOut ? isPublished : isPublishable)
}

// Publishability rule (BUILDER_LISTING_SPEC §1.4): published + approved + on-chain item id present
// + supply remaining. Un-approved/unpublished items can't be minted from.
export function isPublishable(item: PublishableItem): boolean {
  return isPublished(item) && item.remainingSupply > 0
}

/**
 * The same rule WITHOUT the supply condition: the item exists on chain and the creator owns it, whether or
 * not there is anything left to mint. An item that has sold out is still theirs, and still theirs to look
 * at — which is the difference between a collection that shows every item and one that silently shrinks.
 */
export function isPublished(item: PublishableItem): boolean {
  return item.isPublished && item.isApproved && item.blockchainItemId !== '' && item.blockchainItemId != null
}

/**
 * Every item the address has in the builder, across ALL its collections, in one request. The server
 * resolves the on-chain and Catalyst state for the whole set at once, where the per-collection route does
 * that work once per collection — which is what made My Creations cost one round trip per collection.
 */
async function fetchCreatorRawItems(address: string, identity: AuthIdentity): Promise<RawItem[]> {
  const url = `${BUILDER_V1()}/${address.toLowerCase()}/items`
  return unwrap(await getJson<Paginated<RawItem>>(url, identity))
}

/** The previous shape of the read: one request per collection, fail-soft so one bad collection cannot hide the rest. */
async function fetchPublishableItemsPerCollection(
  collections: CreatorCollection[],
  identity: AuthIdentity,
  opts?: { includeSoldOut?: boolean }
): Promise<PublishableItem[]> {
  const perCollection = await Promise.all(
    collections.map(async c => {
      try {
        return await fetchCollectionItems(c, identity, opts)
      } catch {
        return [] as PublishableItem[]
      }
    })
  )
  return perCollection.flat()
}

/**
 * All publishable items across the creator's published collections. Signed as the creator (identity).
 *
 * Two requests, started together: the collections (for names, contracts and minters) and the address-wide
 * item list. Items whose collection is not published — drafts, third-party items — are dropped here, since
 * the address feed carries everything the creator ever made. Should the address feed fail, the read falls
 * back to the per-collection route so the page still loads, just the slow way; the failure is reported
 * because it means the fast path is broken for everyone.
 */
export async function fetchPublishableItems(
  address: string,
  identity: AuthIdentity,
  opts?: { includeSoldOut?: boolean }
): Promise<PublishableItem[]> {
  const [collections, rawItems] = await Promise.all([
    fetchCreatorCollections(address, identity),
    fetchCreatorRawItems(address, identity).catch((error: unknown) => {
      captureError(error, { flow: 'my_creations', step: 'creator_items' })
      return null
    })
  ])
  if (collections.length === 0) return []
  if (rawItems === null) return fetchPublishableItemsPerCollection(collections, identity, opts)

  const byId = new Map(collections.map(c => [c.id, c]))
  const items = await Promise.all(
    rawItems.flatMap(raw => {
      const collection = raw.collection_id ? byId.get(raw.collection_id) : undefined
      return collection ? [toPublishableItem(raw, collection)] : []
    })
  )
  // The address feed carries no order of its own. Keep the collections' order — newest first, as the
  // builder lists them — because that is what the page groups by: left to the feed, the oldest collection
  // surfaced at the top. A stable sort, so items keep their order inside each collection.
  const position = new Map(collections.map((c, i) => [c.id, i]))
  return items
    .filter(opts?.includeSoldOut ? isPublished : isPublishable)
    .sort((a, b) => (position.get(a.collectionId) ?? 0) - (position.get(b.collectionId) ?? 0))
}
