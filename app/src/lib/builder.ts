import signedFetch from 'decentraland-crypto-fetch'
import { Rarity } from '@dcl/schemas'
import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'

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

/** The publishable items inside one collection (only those ready for a primary listing). */
export async function fetchCollectionItems(
  collection: CreatorCollection,
  identity: AuthIdentity
): Promise<PublishableItem[]> {
  const url = `${BUILDER_V1()}/collections/${collection.id}/items`
  const payload = await getJson<Paginated<RawItem>>(url, identity)
  const items = await Promise.all(
    unwrap(payload).map(async raw => {
      const rarity = raw.rarity ?? 'common'
      const total = Number(raw.total_supply ?? 0) || 0
      let max = 0
      try {
        max = Rarity.getMaxSupply(rarity as Rarity)
      } catch {
        max = 0
      }
      const contractAddress = (raw.contract_address ?? collection.contractAddress).toLowerCase()
      const blockchainItemId = raw.blockchain_item_id ?? ''
      const item: PublishableItem = {
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
      return item
    })
  )
  return items.filter(isPublishable)
}

// Publishability rule (BUILDER_LISTING_SPEC §1.4): published + approved + on-chain item id present
// + supply remaining. Un-approved/unpublished items can't be minted from.
export function isPublishable(item: PublishableItem): boolean {
  return (
    item.isPublished &&
    item.isApproved &&
    item.blockchainItemId !== '' &&
    item.blockchainItemId != null &&
    item.remainingSupply > 0
  )
}

/**
 * All publishable items across the creator's published collections. Fail-soft per collection so one
 * bad response doesn't hide the rest. Signed as the creator (identity).
 */
export async function fetchPublishableItems(address: string, identity: AuthIdentity): Promise<PublishableItem[]> {
  const collections = await fetchCreatorCollections(address, identity)
  const perCollection = await Promise.all(
    collections.map(async c => {
      try {
        return await fetchCollectionItems(c, identity)
      } catch {
        return [] as PublishableItem[]
      }
    })
  )
  return perCollection.flat()
}
