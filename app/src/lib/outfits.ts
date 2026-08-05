import signedFetch from 'decentraland-crypto-fetch'
import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'
import { fetchShopItems, type CatalogItem } from '~/lib/api'
import { slotOf } from '~/lib/outfit'
import { isOwnListing } from '~/lib/ownership'

// Outfits: curated shoppable sets of wearables, served by shop-server. Reads are public; authoring
// is ADR-44 signed-fetch gated by the server's OUTFIT_CREATORS allowlist. Items are referenced by
// `<contractAddress>-<itemId>` — NOT CatalogItem.id, which is the trade id on shop feeds (per-listing
// and ephemeral, same rationale as lib/favorites.ts) — and resolved to live CatalogItems at render
// time via fetchCatalogByIds. The endpoint contract mirrors shop-server's routes:
//   GET    /v1/outfits                    published outfits, newest first
//   GET    /v1/outfits/all                authoring view incl. drafts (signed, allowlist)
//   GET    /v1/outfits/:id                published, or any when allowlist-signed
//   POST   /v1/outfits                    create (idempotent on the client-generated uuid)
//   PUT    /v1/outfits/:id                full replace
//   DELETE /v1/outfits/:id                delete (idempotent)
//   POST   /v1/outfits/thumbnails         raw image body → 201 { hash }
//   GET    /v1/outfits/thumbnails/:hash   immutable image bytes

export type OutfitItemRef = { contractAddress: string; itemId: string }

export type OutfitBodyShape = 'male' | 'female' | 'unisex'

export type Outfit = {
  id: string
  name: string
  /** sha256 hex of the uploaded thumbnail, '' on drafts. */
  thumbnailHash: string
  items: OutfitItemRef[]
  bodyShape: OutfitBodyShape
  /** Backdrop gradient stops, top → bottom, as '#rrggbb'. '' on drafts; both required to publish. */
  gradientFrom: string
  gradientTo: string
  authorAddress: string
  published: boolean
  createdAt: number
  updatedAt: number
}

/** The client-authored slice of an outfit; author and timestamps are set server-side. */
export type OutfitDraft = Omit<Outfit, 'authorAddress' | 'createdAt' | 'updatedAt'>

// No host configured = feature unavailable. The SPA host answers unknown paths with 200 + the
// index.html shell, so falling back to the app origin would fake success (see lib/notify.ts).
function outfitsBase(): string | null {
  return config.shopServerUrl || null
}

/** Whether a shop-server host is configured, i.e. outfits can actually be fetched/stored. */
export function isOutfitsAvailable(): boolean {
  return !!outfitsBase()
}

/** The marketplace item id an outfit item resolves by (feed it to fetchCatalogByIds). */
export function outfitItemKey(ref: OutfitItemRef): string {
  return `${ref.contractAddress.toLowerCase()}-${ref.itemId}`
}

/** Errors carry the server's stable snake_case code so the UI can map them to translated copy. */
export class OutfitsError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message ?? `outfits: ${code}`)
    this.code = code
  }
}

// Server error codes with dedicated copy; anything else falls back to the generic message.
const ERROR_KEYS: Record<string, string> = {
  not_allowed: 'outfits.errors.notAllowed',
  not_publishable: 'outfits.errors.notPublishable',
  invalid_items: 'outfits.errors.invalidItems',
  too_large: 'outfits.errors.tooLarge',
  unsupported_type: 'outfits.errors.unsupportedType',
  not_found: 'outfits.errors.notFound'
}

/** The i18n key for a (possibly unknown) outfit error code. */
export function outfitErrorKey(code: string | undefined): string {
  return (code && ERROR_KEYS[code]) || 'outfits.errors.generic'
}

const THUMBNAIL_HASH = /^[0-9a-f]{64}$/

/**
 * Public thumbnail URL for a stored hash (immutable, safe to cache forever), or null when the outfit
 * carries no usable hash — a draft ('') or anything that isn't the sha256 hex the server stores.
 *
 * Validated rather than interpolated blind: the server applies the same `^[0-9a-f]{64}$` before it
 * serves the bytes, so a value that can't pass there has no business being built into a URL here
 * either. Null (not '') so callers have to decide what to render — an empty `src` re-requests the
 * current page rather than showing nothing.
 */
export function thumbnailUrl(hash: string): string | null {
  return THUMBNAIL_HASH.test(hash) ? `${config.shopServerUrl}/v1/outfits/thumbnails/${hash}` : null
}

/**
 * Fallback gradient for an outfit with no stops of its own — the brand amethyst, kept in sync with
 * `theme.gradients.amethyst`. Publishing requires real stops, so this only covers drafts and rows
 * written before the gradient existed.
 */
export const DEFAULT_OUTFIT_GRADIENT = { from: '#c640cd', to: '#691fa9' } as const

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Whether a string is a '#rrggbb' color the gradient can use. */
export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value)
}

/**
 * The CSS backdrop for an outfit's thumbnail: a vertical two-stop gradient the transparent-background
 * thumbnail is composited over. Falls back to the brand gradient when either stop is missing or
 * malformed, so a half-filled draft never renders a broken `linear-gradient`.
 */
export function outfitGradient(outfit: Pick<Outfit, 'gradientFrom' | 'gradientTo'>): string {
  const { from, to } = outfitStops(outfit)
  return `linear-gradient(180deg, ${from} 0%, ${to} 100%)`
}

/** The two stops actually used for rendering, each falling back to the brand color on its own. */
function outfitStops(outfit: Pick<Outfit, 'gradientFrom' | 'gradientTo'>): { from: string; to: string } {
  return {
    from: isHexColor(outfit.gradientFrom) ? outfit.gradientFrom : DEFAULT_OUTFIT_GRADIENT.from,
    to: isHexColor(outfit.gradientTo) ? outfit.gradientTo : DEFAULT_OUTFIT_GRADIENT.to
  }
}

/**
 * The detail preview's backdrop: the same two authored stops as a soft radial glow — the BOTTOM
 * color at the centre, the top color at the edges (the Figma detail treatment).
 */
export function outfitRadialGradient(outfit: Pick<Outfit, 'gradientFrom' | 'gradientTo'>): string {
  const { from, to } = outfitStops(outfit)
  return `radial-gradient(circle, ${to} 0%, ${from} 100%)`
}

/** Peak opacity of the bottom fade — enough to dissolve the legs without flattening the color. */
const FADE_MAX_OPACITY = 0.8

/**
 * The resting-card overlay that dissolves the look's legs into the card instead of cropping them at
 * a hard line: transparent at the top, reaching 80% of the outfit's BOTTOM color at the card's edge.
 * Derived rather than authored, so a creator only ever picks two colors. On hover it crossfades
 * into the neutral dark scrim that carries the revealed info panel.
 */
export function outfitFade(outfit: Pick<Outfit, 'gradientFrom' | 'gradientTo'>): string {
  const { to } = outfitStops(outfit)
  return `linear-gradient(180deg, ${withAlpha(to, 0)} 0%, ${withAlpha(to, FADE_MAX_OPACITY)} 100%)`
}

/** '#rrggbb' + alpha → 'rgba(r, g, b, a)'. Assumes a validated hex (see isHexColor). */
function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  const r = (value >> 16) & 0xff
  const g = (value >> 8) & 0xff
  const b = value & 0xff
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// A 2xx carrying markup is a host answering for a route it doesn't implement — treat it as the
// failure it is instead of parsing garbage (same guard as lib/notify.ts).
async function json<T>(res: { json: () => Promise<unknown> }, label: string): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    throw new Error(`${label}: response was not JSON`)
  }
}

// Extract the server's error code from a failed response and throw it as an OutfitsError.
async function throwCoded(res: { status: number; json: () => Promise<unknown> }, label: string): Promise<never> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  throw new OutfitsError(body?.error ?? `http_${res.status}`, `${label} ${res.status}`)
}

/** Published outfits, newest first. Empty when no host is configured (the row simply hides). */
export async function fetchOutfits(): Promise<Outfit[]> {
  const base = outfitsBase()
  if (!base) return []
  const res = await fetch(`${base}/v1/outfits`)
  if (!res.ok) return throwCoded(res, 'fetchOutfits')
  const body = await json<{ outfits: Outfit[] }>(res, 'fetchOutfits')
  return body.outfits
}

/** Every outfit including drafts — the studio list. Signed; the server enforces the allowlist. */
export async function fetchAllOutfits(identity: AuthIdentity): Promise<Outfit[]> {
  const base = outfitsBase()
  if (!base) throw new Error('fetchAllOutfits: no shop-server host configured')
  const res = await signedFetch(`${base}/v1/outfits/all`, { method: 'GET', identity, metadata: {} })
  if (!res.ok) return throwCoded(res, 'fetchAllOutfits')
  const body = await json<{ outfits: Outfit[] }>(res, 'fetchAllOutfits')
  return body.outfits
}

/**
 * One outfit, or null when it doesn't exist (or is a draft the caller may not see — the server
 * answers 404 for both). Pass the identity to read own drafts in the studio.
 */
export async function fetchOutfit(id: string, identity?: AuthIdentity): Promise<Outfit | null> {
  const base = outfitsBase()
  if (!base) return null
  const url = `${base}/v1/outfits/${encodeURIComponent(id)}`
  const res = identity ? await signedFetch(url, { method: 'GET', identity, metadata: {} }) : await fetch(url)
  if (res.status === 404) {
    void res.body?.cancel()
    return null
  }
  if (!res.ok) return throwCoded(res, 'fetchOutfit')
  const body = await json<{ outfit: Outfit }>(res, 'fetchOutfit')
  return body.outfit
}

/** Create or fully replace an outfit. Throws OutfitsError with the server's code on rejection. */
export async function saveOutfit(
  draft: OutfitDraft,
  identity: AuthIdentity,
  mode: 'create' | 'update'
): Promise<Outfit> {
  const base = outfitsBase()
  if (!base) throw new Error('saveOutfit: no shop-server host configured')
  const url = mode === 'create' ? `${base}/v1/outfits` : `${base}/v1/outfits/${encodeURIComponent(draft.id)}`
  const res = await signedFetch(url, {
    method: mode === 'create' ? 'POST' : 'PUT',
    identity,
    metadata: {},
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft)
  })
  if (!res.ok) return throwCoded(res, 'saveOutfit')
  const body = await json<{ outfit: Outfit }>(res, 'saveOutfit')
  return body.outfit
}

/** Delete an outfit (idempotent server-side). */
export async function deleteOutfit(id: string, identity: AuthIdentity): Promise<void> {
  const base = outfitsBase()
  if (!base) throw new Error('deleteOutfit: no shop-server host configured')
  const res = await signedFetch(`${base}/v1/outfits/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    identity,
    metadata: {}
  })
  if (!res.ok) return throwCoded(res, 'deleteOutfit')
  void res.body?.cancel()
}

/**
 * Upload a thumbnail as a raw image body (no multipart) and get back its content hash. The server
 * caps size at 1 MB and sniffs the real type — pre-validate client-side for friendlier errors.
 */
export const MAX_THUMBNAIL_BYTES = 1024 * 1024

export async function uploadThumbnail(image: Blob, identity: AuthIdentity): Promise<string> {
  const base = outfitsBase()
  if (!base) throw new Error('uploadThumbnail: no shop-server host configured')
  const res = await signedFetch(`${base}/v1/outfits/thumbnails`, {
    method: 'POST',
    identity,
    metadata: {},
    body: image
  })
  if (!res.ok) return throwCoded(res, 'uploadThumbnail')
  const body = await json<{ hash: string }>(res, 'uploadThumbnail')
  return body.hash
}

// ---------------------------------------------------------------------------
// Availability classification — the one shared answer to "can this resolved
// item actually be bought right now, and if not, why?". Drives the outfit
// card/detail states, the add-all filter, and the skip-reason toast counts.
// ---------------------------------------------------------------------------

export type OutfitItemState = 'purchasable' | 'unavailable' | 'own_listing' | 'in_cart'

/**
 * Whether the listing itself is dead: unpriced, or a primary (mint) listing with zero remaining
 * supply. Note `priceCredits > 0` alone misses sold-out primaries — they keep a listed price.
 *
 * `available` and `tokenId` are populated by shopListingToItem / unifiedListingToItem (the /v3 feeds)
 * AND by the /v2 by-ids path outfit refs resolve through for display. Nothing is ever ADDED to the
 * cart off a /v2 row regardless — see {@link resolveOutfitPurchases}, which re-reads each item from
 * the shop feed before it becomes a cart line.
 */
export function isListingUnavailable(item: Pick<CatalogItem, 'priceCredits' | 'tokenId' | 'available'>): boolean {
  if (item.priceCredits <= 0) return true
  const isPrimary = !item.tokenId
  return isPrimary && typeof item.available === 'number' && item.available <= 0
}

/**
 * Whether a shopper can still buy this item **from its creator** — a live mint with supply left.
 * Deliberately stricter than {@link isListingUnavailable}: resale-only counts as NOT buyable here,
 * because an outfit is authored from mints (the studio picker is primary-only) and a look assembled
 * out of other people's resales is not the thing the creator published.
 *
 * This is the discovery row's admission test: a shopper must never meet an outfit they cannot buy
 * complete, whatever the reason — delisted, minted out, unpriced, or creator-withdrawn. Reasons are
 * the DETAIL page's job, per item.
 *
 * Only meaningful on rows that report supply and mint price separately (the /v2 by-ids path). A row
 * with no `hasPrimaryListing` answer is treated as not-from-the-creator rather than assumed alive —
 * an over-strict row is a missing card, an under-strict one is a shopper hitting a dead end.
 */
export function isBuyableFromCreator(item: CatalogItem): boolean {
  if (isListingUnavailable(item)) return false
  return item.hasPrimaryListing === true && (item.available ?? 0) > 0
}

/**
 * One listing's identity, comparable ACROSS feeds. The shop feeds key a row by its trade id
 * (`shopListingToItem` sets `id: l.tradeId`) while the /v2 catalog keys it by `contract-itemId`, so
 * the raw `id` of the same wearable differs depending on where it was read — which made the same
 * item added from the grid and from an outfit two separate cart lines, and made an outfit's
 * "in your cart" badge blind to anything added elsewhere.
 *
 * A specific token (secondary) is its own listing, so it keys by tokenId; everything else keys by
 * item. Note this agrees with {@link outfitItemKey} for a primary row by construction — an outfit
 * ref and the item it resolves to produce the same string.
 */
export function listingIdentity(item: Pick<CatalogItem, 'contractAddress' | 'itemId' | 'tokenId'>): string {
  const suffix = item.tokenId ? `t${item.tokenId}` : (item.itemId ?? '')
  return `${item.contractAddress.toLowerCase()}-${suffix}`
}

export function classifyOutfitItem(
  item: CatalogItem,
  options: { address?: string | null; cartKeys: ReadonlySet<string> }
): OutfitItemState {
  if (isListingUnavailable(item)) return 'unavailable'
  if (isOwnListing(item, options.address)) return 'own_listing'
  if (options.cartKeys.has(listingIdentity(item))) return 'in_cart'
  return 'purchasable'
}

/**
 * Re-read the outfit's items from the SHOP feed, which is what a cart line has to be built from.
 *
 * Outfit refs resolve for DISPLAY through the /v2 catalog: one batched request covers every card on
 * the row, and a thumbnail + a price is all a card needs. But those rows carry no `acquisition`, no
 * `tradeId` and no `available`, and a cart line needs all three — `acquisition` decides which
 * purchase rail checkout takes (a CollectionStore mint has no trade to resolve, so a line missing it
 * defaults to 'trade' and resolves to nothing, i.e. reads as sold-out in the cart it was just added
 * to), and `available` is what makes a sold-out mint drop out before it is charged.
 *
 * So the add-all CTA resolves here first and adds THESE items — the very rows the browse grid would
 * have put in the cart.
 *
 * Deliberately NOT restricted to `listingType: 'primary'`. The studio picker is primary-only, but
 * that constrains AUTHORING, not shopping: a look whose jacket has since minted out but is still
 * resold should stay buyable. `groupBy: 'item'` prices a row primary-if-present else cheapest
 * credit-buyable resale — the same rule as the `price ?? minPrice` the /v2 row the card priced from
 * uses — so what is added matches what was shown rather than undercutting it.
 *
 * One request per item — the unified feed has no id-list filter — but bounded by an outfit's 10-item
 * ceiling and only ever on an explicit click. A rejection propagates: an item that fails to resolve
 * is an OUTAGE, not a sell-out, and must never be reported as one (the caller aborts the whole add
 * and offers a retry instead of quietly building a short basket).
 */
export async function resolveOutfitPurchases(refs: OutfitItemRef[]): Promise<Map<string, CatalogItem>> {
  const resolved = await Promise.all(
    refs.map(async ref => {
      // No `onSale` filter: the unified handler does not read one, and passing it would imply a
      // server-side guarantee that isn't there. Liveness is decided here, by isListingUnavailable.
      const { items } = await fetchShopItems({
        contractAddress: ref.contractAddress,
        itemId: ref.itemId,
        first: 1
      })
      const item = items[0]
      return item && !isListingUnavailable(item) ? { key: outfitItemKey(ref), item } : null
    })
  )
  const live = new Map<string, CatalogItem>()
  for (const entry of resolved) {
    if (entry) live.set(entry.key, entry.item)
  }
  return live
}

/** What a pasted avatar-preview link yields: item refs, and session-only presentation extras. */
export type OutfitImport = {
  items: OutfitItemRef[]
  bodyShape?: Exclude<OutfitBodyShape, 'unisex'>
  /** Avatar colors for the studio preview only — the outfit record stores no colors. */
  colors?: { skin?: string; hair?: string; eyes?: string }
}

const IMPORT_ITEM_URN = /^urn:decentraland:(?:matic|amoy):collections-v2:(0x[0-9a-f]{40}):(\d+)$/i

/**
 * Parse an avatar-preview link (or its bare query string) into outfit-import data: the
 * collections-v2 `urn` params become item refs — wearables or emotes alike, both are outfit items
 * (deduped, capped at {@link MAX_OUTFIT_ITEMS}) — the `bodyShape` base-avatar urn picks male/female,
 * and skin/hair/eye colors ride along for the studio preview. Anything else (off-chain wearables, the
 * builder-relative `emote` path, which names a builder-local file rather than a listed item) is
 * ignored. Null when no usable item urns are found.
 */
export function parseOutfitImport(raw: string): OutfitImport | null {
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw
  const params = new URLSearchParams(query)

  const seen = new Set<string>()
  const items: OutfitItemRef[] = []
  for (const urn of params.getAll('urn')) {
    const match = IMPORT_ITEM_URN.exec(urn.trim())
    if (!match) continue
    const ref = { contractAddress: match[1].toLowerCase(), itemId: match[2] }
    const key = outfitItemKey(ref)
    if (seen.has(key)) continue
    seen.add(key)
    items.push(ref)
  }
  if (items.length === 0) return null

  const shapeUrn = params.get('bodyShape') ?? ''
  const bodyShape = /basefemale$/i.test(shapeUrn) ? 'female' : /basemale$/i.test(shapeUrn) ? 'male' : undefined

  const color = (name: string): string | undefined => {
    const value = (params.get(name) ?? '').trim().replace(/^#/, '')
    return /^[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined
  }
  const colors = { skin: color('skinColor'), hair: color('hairColor'), eyes: color('eyeColor') }

  return {
    items: items.slice(0, MAX_OUTFIT_ITEMS),
    bodyShape,
    colors: colors.skin || colors.hair || colors.eyes ? colors : undefined
  }
}

export const MIN_OUTFIT_ITEMS = 1
export const MAX_OUTFIT_ITEMS = 20

/**
 * Toggle an item in an outfit's ref list, keeping the set slot-consistent: adding a wearable drops
 * any already-picked item in the same avatar slot (the studio's one-item-per-slot rule). Refs whose
 * catalog item is unknown can't declare a slot, so they never conflict and keep their place.
 */
export function toggleOutfitItem(
  refs: OutfitItemRef[],
  picked: CatalogItem,
  resolved: ReadonlyMap<string, CatalogItem>
): OutfitItemRef[] {
  if (!picked.itemId) return refs
  const pickedRef: OutfitItemRef = { contractAddress: picked.contractAddress.toLowerCase(), itemId: picked.itemId }
  const pickedKey = outfitItemKey(pickedRef)
  if (refs.some(ref => outfitItemKey(ref) === pickedKey)) {
    return refs.filter(ref => outfitItemKey(ref) !== pickedKey)
  }
  const slot = slotOf(picked)
  const kept =
    slot == null
      ? refs
      : refs.filter(ref => {
          const item = resolved.get(outfitItemKey(ref))
          return !item || slotOf(item) !== slot
        })
  return [...kept, pickedRef]
}

export type OutfitItemsSplit = {
  purchasable: CatalogItem[]
  unavailable: CatalogItem[]
  ownListing: CatalogItem[]
  inCart: CatalogItem[]
}

export function splitOutfitItems(
  items: CatalogItem[],
  options: { address?: string | null; cartKeys: ReadonlySet<string> }
): OutfitItemsSplit {
  const split: OutfitItemsSplit = { purchasable: [], unavailable: [], ownListing: [], inCart: [] }
  for (const item of items) {
    const state = classifyOutfitItem(item, options)
    switch (state) {
      case 'unavailable':
        split.unavailable.push(item)
        break
      case 'own_listing':
        split.ownListing.push(item)
        break
      case 'in_cart':
        split.inCart.push(item)
        break
      case 'purchasable':
        split.purchasable.push(item)
        break
      default: {
        // A new OutfitItemState with no case here is a compile error, not a silent bucket. It must
        // never fall through to `purchasable`: an unrecognised state is unknown, and the one thing
        // this split may not do is talk an item INTO the basket by default.
        const exhaustive: never = state
        void exhaustive
      }
    }
  }
  return split
}
