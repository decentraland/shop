import { ethers } from 'ethers'
import type { AuthIdentity } from '@dcl/crypto'
import { TradeAssetType, type Trade, type TradeCreation } from '@dcl/schemas'
import { config } from '~/config'

const NFT_V1 = `${config.nftApiUrl}/v1`

// ---------------------------------------------------------------------------
// Catalog (browse grid)
// ---------------------------------------------------------------------------

export type CatalogItem = {
  id: string
  name: string
  creator: string
  contractAddress: string
  itemId: string | null
  category: string
  wearableCategory?: string
  rarity: string
  network: string
  chainId: number
  thumbnail: string
  priceCredits: number
  gender: 'male' | 'female' | 'unisex' | null
  // Smart wearable (carries an interactive scene/game.js). Surfaces a "Smart" badge on the card.
  isSmart: boolean
  // Present for secondary listings (a specific token on sale): the open USD-pegged trade + its token.
  // Checkout uses `tradeId` directly instead of resolving by itemId.
  tradeId?: string
  tokenId?: string
  // Flash sale (see lib/sale.ts). Present only when the listing is a live, discounted, time-boxed
  // trade. `compareAtCredits` is the pre-sale price to strike through; `saleEndsAt` is epoch MS (the
  // mapper converts the trade's expiration seconds once). Both absent for a regular listing.
  compareAtCredits?: number
  saleEndsAt?: number
}

type RawCatalogItem = {
  id: string
  name: string
  creator?: string
  contractAddress: string
  itemId?: string | null
  category: string
  rarity?: string
  network: string
  chainId: number
  thumbnail?: string
  price?: string | null
  minPrice?: string | null
  data?: {
    wearable?: { category?: string; bodyShapes?: string[]; description?: string; isSmart?: boolean }
    emote?: { category?: string; description?: string }
  }
}

// USD-pegged listing price (USD wei, 1e18 = $1) → fixed credits (1 credit = $0.10), so $1 = 10 credits.
// Floor (not round) so the displayed price never exceeds what checkout actually charges.
// USD-pegged price (USD wei) → whole credits (1 credit = $0.10), rounded UP so the shown price
// matches what the buyer is charged (the server rounds the charge up to a whole credit too — see
// design/DECISIONS.md "Model B"). Credits are always whole.
function toCredits(price?: string | null): number {
  if (!price) return 0
  try {
    return Math.ceil(Number(ethers.utils.formatEther(price)) * 10)
  } catch {
    return 0
  }
}

// USD-pegged amount (USD wei, 1e18 = $1) → cents, rounded UP. Used to size the authorized credit so
// it never under-covers what the trade settles for (a short credit reverts useCredits on-chain).
// BigInt-based to stay exact for large wei amounts.
export function usdWeiToCents(amount?: string | null): number {
  if (!amount) return 0
  try {
    const wei = BigInt(amount)
    const centWei = 10n ** 16n // 1e16 wei = 1 cent
    return Number((wei + centWei - 1n) / centWei) // ceil
  } catch {
    return 0
  }
}

function toGender(bodyShapes?: string[]): CatalogItem['gender'] {
  if (!bodyShapes || bodyShapes.length === 0) return null
  const male = bodyShapes.some(b => b.includes('Male'))
  const female = bodyShapes.some(b => b.includes('Female'))
  if (male && female) return 'unisex'
  if (male) return 'male'
  if (female) return 'female'
  return null
}

function toCatalogItem(r: RawCatalogItem): CatalogItem {
  return {
    id: r.id,
    name: r.name,
    creator: r.creator ?? '',
    contractAddress: r.contractAddress,
    itemId: r.itemId ?? null,
    category: r.category,
    wearableCategory: r.data?.wearable?.category ?? r.data?.emote?.category,
    rarity: r.rarity ?? 'common',
    network: r.network,
    chainId: r.chainId,
    thumbnail: r.thumbnail ?? '',
    priceCredits: toCredits(r.price ?? r.minPrice),
    gender: toGender(r.data?.wearable?.bodyShapes),
    isSmart: r.data?.wearable?.isSmart ?? false,
  }
}

export async function fetchCatalog({
  category = 'wearable',
  first = 24,
  skip = 0,
}: { category?: string; first?: number; skip?: number } = {}): Promise<{ items: CatalogItem[]; total: number }> {
  const qs = new URLSearchParams({
    category,
    first: String(first),
    skip: String(skip),
    isOnSale: 'true',
    sortBy: 'newest',
    includeSocialEmotes: 'false',
  })
  const res = await fetch(`${config.nftApiUrl}/v2/catalog?${qs.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch catalog (${res.status})`)
  const { data, total } = (await res.json()) as { data: RawCatalogItem[]; total: number }
  return { items: data.map(toCatalogItem), total: total ?? data.length }
}

// The item's long description for the detail page. It isn't in the shop feed (ShopListingRaw), so read
// it from the v2 catalog by contract + itemId. Returns '' when the item has none / on any error.
export async function fetchItemDescription(contractAddress: string, itemId: string): Promise<string> {
  const qs = new URLSearchParams({ contractAddresses: contractAddress, itemId, first: '1' })
  try {
    const res = await fetch(`${config.nftApiUrl}/v2/catalog?${qs.toString()}`)
    if (!res.ok) return ''
    const { data } = (await res.json()) as { data?: RawCatalogItem[] }
    const d = data?.[0]?.data
    return (d?.wearable?.description ?? d?.emote?.description ?? '').trim()
  } catch {
    return ''
  }
}

// Per-item sale state for a creator's collection, from the v3 shop feed. Keyed by itemId, carries the
// tradeId so My Assets can both show "on sale" and take a primary listing down. Only USD-pegged
// (credit-buyable) primary listings appear here.
export async function fetchCollectionSaleState(
  contractAddress: string
): Promise<Record<string, { isOnSale: boolean; priceCredits: number; tradeId: string }>> {
  const { listings } = await fetchShopListingsRaw({ contractAddress, first: 200 })
  const map: Record<string, { isOnSale: boolean; priceCredits: number; tradeId: string }> = {}
  for (const l of listings) {
    if (l.listingType !== 'primary' || l.itemId == null) continue
    map[String(l.itemId)] = { isOnSale: true, priceCredits: l.priceCredits, tradeId: l.tradeId }
  }
  return map
}

type NftMeta = {
  name: string
  image: string
  category: string
  data?: { wearable?: { rarity?: string }; emote?: { rarity?: string } }
}

// Name + thumbnail for a specific token (secondary listings don't carry item metadata).
async function fetchNftMeta(contractAddress: string, tokenId: string): Promise<NftMeta | null> {
  const qs = new URLSearchParams({ contractAddress, tokenId, first: '1' })
  const res = await fetch(`${NFT_V1}/nfts?${qs.toString()}`)
  if (!res.ok) return null
  const { data } = (await res.json()) as { data: Array<{ nft: NftMeta }> }
  return data?.[0]?.nft ?? null
}

// ---------------------------------------------------------------------------
// Shop catalog (v3) — the curated credit-buyable (USD-pegged) listings feed.
// One request, already joined + priced in credits + carrying the tradeId (so buy/cancel need no
// second lookup). Unifies primary (mint) + secondary (resale). Replaces the old N+1 over /v1/orders.
// ---------------------------------------------------------------------------

type ShopListingRaw = {
  tradeId: string
  listingType: 'primary' | 'secondary'
  contractAddress: string
  itemId: string | null
  tokenId: string | null
  name: string
  thumbnail: string
  rarity: string
  category: string
  wearableCategory: string | null
  gender?: 'male' | 'female' | 'unisex' | null
  creator: string
  priceCredits: number
  available: number
  network: string
  chainId: number
  isSmart?: boolean
  // Flash sale, when the shop catalog resolves this listing as on-sale: the pre-sale price (whole
  // credits) to compare against + the sale end as a unix expiration in SECONDS (the trade's
  // Checks.expiration). Absent for regular listings. See marketplace-server shop-catalog.
  compareAtCredits?: number | null
  saleEndsAt?: number | null
}

function shopListingToItem(l: ShopListingRaw): CatalogItem {
  return {
    id: l.tradeId,
    tradeId: l.tradeId,
    name: l.name,
    creator: l.creator, // full address — the UI resolves the profile name/avatar (see CreatorBadge)
    contractAddress: l.contractAddress,
    itemId: l.itemId,
    tokenId: l.tokenId ?? undefined,
    category: l.category,
    wearableCategory: l.wearableCategory ?? undefined,
    rarity: l.rarity,
    network: l.network,
    chainId: l.chainId,
    thumbnail: l.thumbnail,
    priceCredits: l.priceCredits,
    gender: l.gender ?? null,
    isSmart: l.isSmart ?? false,
    // Only surface a compare-at that's actually above the sale price (the badge/strikethrough guard
    // against a stale or equal value). saleEndsAt arrives as unix seconds → ms for the UI.
    compareAtCredits:
      l.compareAtCredits != null && l.compareAtCredits > l.priceCredits ? l.compareAtCredits : undefined,
    saleEndsAt: l.saleEndsAt != null ? l.saleEndsAt * 1000 : undefined,
  }
}

export type ShopSort = 'newest' | 'cheapest' | 'most_expensive' | 'name'

export type ShopListingFilters = {
  category?: string
  first?: number
  skip?: number
  contractAddress?: string
  itemId?: string
  creator?: string
  rarities?: string[]
  wearableCategories?: string[]
  minPriceCredits?: number
  maxPriceCredits?: number
  search?: string
  sortBy?: ShopSort
}

async function fetchShopListingsRaw(
  params: ShopListingFilters
): Promise<{ listings: ShopListingRaw[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.category === 'wearable' || params.category === 'emote') qs.set('category', params.category)
  if (params.first != null) qs.set('first', String(params.first))
  if (params.skip != null) qs.set('skip', String(params.skip))
  if (params.contractAddress) qs.set('contractAddress', params.contractAddress)
  if (params.itemId != null) qs.set('itemId', params.itemId)
  if (params.creator) qs.set('creator', params.creator)
  if (params.rarities?.length) qs.set('rarity', params.rarities.join(','))
  if (params.wearableCategories?.length) qs.set('wearableCategory', params.wearableCategories.join(','))
  if (params.minPriceCredits != null) qs.set('minPriceCredits', String(params.minPriceCredits))
  if (params.maxPriceCredits != null) qs.set('maxPriceCredits', String(params.maxPriceCredits))
  if (params.search) qs.set('search', params.search)
  if (params.sortBy) qs.set('sortBy', params.sortBy)
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/shop?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchShopListings ${res.status}`)
  const json = (await res.json()) as { data?: ShopListingRaw[]; total?: number }
  return { listings: json.data ?? [], total: json.total ?? 0 }
}

// A single credit-buyable listing for a specific item (primary) — used to hydrate the item detail
// page on deep-link/refresh, where the route segment is the itemId. Null if it's not on sale.
export async function fetchShopListingForItem(contractAddress: string, itemId: string): Promise<CatalogItem | null> {
  const { listings } = await fetchShopListingsRaw({ contractAddress, itemId, first: 1 })
  return listings[0] ? shopListingToItem(listings[0]) : null
}

// Credit-buyable listings for the browse grid (primary + secondary, USD-pegged). All filtering
// (category, rarity, price, sub-category, search, sort) happens server-side on /v3/catalog/shop.
// Still used by the Overview drops row + the Cart upsell; the main browse grid uses fetchUnified.
export async function fetchListings({ first = 100, ...filters }: ShopListingFilters = {}): Promise<{
  items: CatalogItem[]
  total: number
}> {
  const { listings, total } = await fetchShopListingsRaw({ ...filters, first })
  return { items: listings.map(shopListingToItem), total }
}

// ---------------------------------------------------------------------------
// Unified catalog (v3) — the single browse feed that mixes NATIVE (USD-pegged, credit-buyable, Add to
// cart) and LEGACY (classic MANA-priced) liquidity in one grid. Same query params as /v3/catalog/shop.
// Each row carries the existing ShopListing fields PLUS:
//   - source: 'native' | 'legacy'
//   - manaWei: raw MANA price, present ONLY for legacy rows (null for native)
//   - priceCredits: server-computed (native = fixed price; legacy = a snapshot — but the UI DISPLAYS
//     legacy with the LIVE rate, not this snapshot; see pages/Assets + lib/mana-rate).
// This is the ONE place the /v3/catalog/unified URL lives.
// ---------------------------------------------------------------------------

export type ListingSource = 'native' | 'legacy'

export type UnifiedListing = CatalogItem & {
  source: ListingSource
  // Raw MANA wei price for legacy rows (converted to fluctuating credits in the UI); null for native.
  manaWei: string | null
}

type UnifiedListingRaw = ShopListingRaw & {
  source: ListingSource
  manaWei?: string | null
}

function unifiedListingToItem(l: UnifiedListingRaw): UnifiedListing {
  return { ...shopListingToItem(l), source: l.source, manaWei: l.manaWei ?? null }
}

// The unified browse grid: native + legacy listings in one feed. All filtering/sort/search happens
// server-side on /v3/catalog/unified (same params as fetchListings). Native rows render Add to cart at
// their fixed priceCredits; legacy rows render an "≈" live-rate price + Buy Now (see pages/Assets).
export async function fetchUnified({ first = 100, ...filters }: ShopListingFilters = {}): Promise<{
  items: UnifiedListing[]
  total: number
}> {
  const qs = new URLSearchParams()
  if (filters.category === 'wearable' || filters.category === 'emote') qs.set('category', filters.category)
  qs.set('first', String(first))
  if (filters.skip != null) qs.set('skip', String(filters.skip))
  if (filters.contractAddress) qs.set('contractAddress', filters.contractAddress)
  if (filters.itemId != null) qs.set('itemId', filters.itemId)
  if (filters.creator) qs.set('creator', filters.creator)
  if (filters.rarities?.length) qs.set('rarity', filters.rarities.join(','))
  if (filters.wearableCategories?.length) qs.set('wearableCategory', filters.wearableCategories.join(','))
  if (filters.minPriceCredits != null) qs.set('minPriceCredits', String(filters.minPriceCredits))
  if (filters.maxPriceCredits != null) qs.set('maxPriceCredits', String(filters.maxPriceCredits))
  if (filters.search) qs.set('search', filters.search)
  if (filters.sortBy) qs.set('sortBy', filters.sortBy)
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/unified?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchUnified ${res.status}`)
  const json = (await res.json()) as { data?: UnifiedListingRaw[]; total?: number }
  const data = json.data ?? []
  return { items: data.map(unifiedListingToItem), total: json.total ?? data.length }
}

// The legacy (classic MANA-priced) listing shape that MarketCheckout (Buy Now) consumes. A legacy row
// from the unified feed is projected into this shape before opening checkout (see pages/Assets). These
// listings are priced in MANA (not USD-pegged) so their credit price FLUCTUATES with the market rate.
export type LegacyListing = {
  tradeId: string
  listingType: 'primary'
  contractAddress: string
  itemId: string
  name: string
  thumbnail: string
  rarity: string
  category: string
  wearableCategory: string | null
  creator: string
  manaWei: string // 18-decimal MANA price → converted to (fluctuating) credits in the UI
  available: number
  network: string
  chainId: number
  createdAt: number
}

type LegacyListingRaw = Partial<LegacyListing> & {
  tradeId: string
  contractAddress: string
  manaWei: string
}

function toLegacyListing(l: LegacyListingRaw): LegacyListing {
  return {
    tradeId: l.tradeId,
    listingType: 'primary',
    contractAddress: l.contractAddress,
    itemId: l.itemId ?? '',
    name: l.name ?? '',
    thumbnail: l.thumbnail ?? '',
    rarity: l.rarity ?? 'common',
    category: l.category ?? 'wearable',
    wearableCategory: l.wearableCategory ?? null,
    creator: l.creator ?? '',
    manaWei: l.manaWei,
    available: l.available ?? 0,
    network: l.network ?? 'MATIC',
    chainId: l.chainId ?? config.chainId,
    createdAt: l.createdAt ?? 0,
  }
}

// Legacy (classic MANA-priced) listings for the Market grid. Same server-side filtering/sort/search
// as fetchListings, but against /v3/catalog/legacy. Prices are returned in MANA wei — the caller
// converts to (fluctuating) credits with the live market rate (see lib/mana-rate).
export async function fetchLegacyListings({ first = 100, ...filters }: ShopListingFilters = {}): Promise<{
  items: LegacyListing[]
  total: number
}> {
  const qs = new URLSearchParams()
  if (filters.category === 'wearable' || filters.category === 'emote') qs.set('category', filters.category)
  qs.set('first', String(first))
  if (filters.skip != null) qs.set('skip', String(filters.skip))
  if (filters.contractAddress) qs.set('contractAddress', filters.contractAddress)
  if (filters.itemId != null) qs.set('itemId', filters.itemId)
  if (filters.creator) qs.set('creator', filters.creator)
  if (filters.rarities?.length) qs.set('rarity', filters.rarities.join(','))
  if (filters.wearableCategories?.length) qs.set('wearableCategory', filters.wearableCategories.join(','))
  if (filters.minPriceCredits != null) qs.set('minPriceCredits', String(filters.minPriceCredits))
  if (filters.maxPriceCredits != null) qs.set('maxPriceCredits', String(filters.maxPriceCredits))
  if (filters.search) qs.set('search', filters.search)
  if (filters.sortBy) qs.set('sortBy', filters.sortBy)
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/legacy?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchLegacyListings ${res.status}`)
  const json = (await res.json()) as { data?: LegacyListingRaw[]; total?: number }
  const data = json.data ?? []
  return { items: data.map(toLegacyListing), total: json.total ?? data.length }
}

export type MyAsset = {
  id: string
  contractAddress: string
  tokenId: string
  itemId: string | null
  name: string
  category: string
  image: string
  rarity?: string
  network: string
  chainId: number
  isOnSale: boolean
  listingPrice?: number
  // The open listing's trade id (present when isOnSale) — used to take the listing down.
  tradeId?: string
}

type NFTResult = {
  nft: {
    id: string
    contractAddress: string
    tokenId: string
    itemId: string | null
    name: string
    category: string
    image: string
    network: string
    chainId: number
    data?: { wearable?: { rarity?: string }; emote?: { rarity?: string } }
  }
  order: { price?: string | null; tradeId?: string } | null
}

// Has `owner` received a token of this item yet, according to the indexer? The purchase tx confirming
// on-chain isn't enough for the item to appear in My Assets — that page reads the indexed NFTs, which
// lag the chain. The Success page polls this after the tx settles so it only claims "It's yours!" once
// the item is actually queryable (and thus visible in My Assets). Any error → false (treat as not-yet).
export async function fetchOwnsItem(owner: string, contractAddress: string, itemId: string): Promise<boolean> {
  try {
    const qs = new URLSearchParams({ owner: owner.toLowerCase(), contractAddress, itemId, first: '1' })
    const res = await fetch(`${NFT_V1}/nfts?${qs.toString()}`)
    if (!res.ok) return false
    const { total } = (await res.json()) as { total?: number }
    return (total ?? 0) > 0
  } catch {
    return false
  }
}

export async function fetchMyAssets(
  owner: string,
  { category = 'wearable', first = 48, skip = 0 }: { category?: string; first?: number; skip?: number } = {}
): Promise<{ assets: MyAsset[]; total: number }> {
  const qs = new URLSearchParams({
    owner: owner.toLowerCase(),
    category,
    first: String(first),
    skip: String(skip),
    sortBy: 'newest',
    orderDirection: 'desc',
  })
  const res = await fetch(`${NFT_V1}/nfts?${qs.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch assets (${res.status})`)
  const { data, total } = (await res.json()) as { data: NFTResult[]; total: number }

  const assets = data.map(r => ({
    id: r.nft.id,
    contractAddress: r.nft.contractAddress,
    tokenId: r.nft.tokenId,
    itemId: r.nft.itemId ?? null,
    name: r.nft.name,
    category: r.nft.category,
    image: r.nft.image,
    rarity: r.nft.data?.wearable?.rarity ?? r.nft.data?.emote?.rarity,
    network: r.nft.network,
    chainId: r.nft.chainId,
    isOnSale: r.order != null,
    listingPrice: r.order ? toCredits(r.order.price) : undefined,
    tradeId: r.order?.tradeId,
  }))

  return { assets, total }
}

// The metadata "signer" is the APP identifier (server validates it ∈ ['dcl:marketplace','dcl:builder']),
// NOT the wallet — the wallet is proven via the auth-chain headers built from `identity`.
const API_SIGNER = 'dcl:marketplace'

// Posts an already-signed TradeCreation. Reuses decentraland-dapps' TradeService only for the
// authenticated POST (auth-chain headers, intent dcl:create-trade) — the signing is ours.
export async function postTrade(trade: TradeCreation, identity: AuthIdentity) {
  // Loaded on demand (only when creating a listing) — decentraland-dapps drags in ui2/@mui via its
  // lib barrel, so keeping it dynamic keeps that weight out of the browse/initial bundle.
  const { TradeService } = await import('decentraland-dapps/dist/modules/trades/TradeService')
  const service = new TradeService(API_SIGNER, config.marketplaceServerUrl, () => identity)
  return service.addTrade(trade)
}

// The signed trade behind a listing is not immutable: the server re-signs it as availability
// decrements or the sale/expiration window rolls, which mints a NEW tradeId and retires the old one.
// So a tradeId captured earlier (router state, a cached feed row, a stored cart line) can 404 even
// though the item is still on sale under a fresh trade. Callers distinguish this not-found from other
// failures via this error so they can re-resolve the item's CURRENT trade (see resolveLiveTrade).
export class TradeNotFoundError extends Error {
  constructor(public tradeId: string) {
    // Keep the legacy message so any message-based handling keeps working.
    super('fetchTrade 404')
    this.name = 'TradeNotFoundError'
  }
}

// Full signed Trade (signer, signature, checks, sent, received) needed to execute a purchase.
// The endpoint wraps the trade in `{ ok, data }` — unwrap it (otherwise received/sent are undefined).
export async function fetchTrade(tradeId: string): Promise<Trade> {
  const res = await fetch(`${config.marketplaceServerUrl}/v1/trades/${tradeId}`)
  if (res.status === 404) throw new TradeNotFoundError(tradeId)
  if (!res.ok) throw new Error(`fetchTrade ${res.status}`)
  const json = (await res.json()) as { ok?: boolean; data?: Trade } | Trade
  return ((json as { data?: Trade }).data ?? json) as Trade
}

// Resolve an item's CURRENT signed trade, tolerant of a stale/expired tradeId. Tries the known
// tradeId first (fast path — no extra lookup); if that 404s (the trade was re-signed/retired) and we
// can identify the item, re-resolves the live trade from the shop feed by (contract, itemId). Any
// other failure propagates — we must never silently swap to a different trade on a transient error,
// and we only ever re-resolve BY ITEM so a caller can't end up buying an unrelated trade. Returns
// null when the item has no live listing at all (never listed / sold out / cancelled).
export async function resolveLiveTrade(item: {
  tradeId?: string
  contractAddress: string
  itemId?: string | null
}): Promise<Trade | null> {
  if (item.tradeId) {
    try {
      return await fetchTrade(item.tradeId)
    } catch (e) {
      if (!(e instanceof TradeNotFoundError) || !item.itemId) throw e
      // fall through: the cached trade is gone — re-resolve the item's current listing.
    }
  }
  if (item.itemId) return fetchTradeForItem(item.contractAddress, item.itemId)
  return null
}

// Name + thumbnail for a collection ITEM (primary sales don't have a minted token yet).
async function fetchItemMeta(
  contractAddress: string,
  itemId: string
): Promise<{ name?: string; thumbnail?: string } | null> {
  const qs = new URLSearchParams({ contractAddress, itemId, first: '1' })
  const res = await fetch(`${NFT_V1}/items?${qs.toString()}`)
  if (!res.ok) return null
  const { data } = (await res.json()) as { data: Array<{ name?: string; thumbnail?: string }> }
  return data?.[0] ?? null
}

// A purchase-history row's display info, resolved from its trade: what was bought + what it cost.
export type PurchaseDisplay = {
  name: string
  thumbnail: string
  credits: number
  contractAddress: string
  tokenId?: string
  itemId?: string
}

// Resolve a purchased trade to something we can render (name, thumbnail, price). Handles both
// secondary (ERC721 token) and primary (collection item) listings; falls back gracefully.
export async function fetchTradeDisplay(tradeId: string): Promise<PurchaseDisplay | null> {
  let trade: Trade
  try {
    trade = await fetchTrade(tradeId)
  } catch {
    return null
  }
  const sent = trade.sent?.[0] as { assetType?: number; contractAddress?: string; value?: string } | undefined
  const priceAsset = trade.received?.[0] as { amount?: string } | undefined
  const credits = toCredits(priceAsset?.amount)
  const contractAddress = sent?.contractAddress ?? ''
  const value = sent?.value ?? ''
  if (!contractAddress) return { name: 'Item', thumbnail: '', credits, contractAddress: '' }

  if (sent?.assetType === TradeAssetType.COLLECTION_ITEM) {
    const meta = await fetchItemMeta(contractAddress, value)
    return { name: meta?.name ?? 'Item', thumbnail: meta?.thumbnail ?? '', credits, contractAddress, itemId: value }
  }
  const meta = await fetchNftMeta(contractAddress, value)
  return { name: meta?.name ?? `#${value}`, thumbnail: meta?.image ?? '', credits, contractAddress, tokenId: value }
}

// Open credit-buyable listing (Trade) for a catalog ITEM (primary/mint), or null if none. Resolves
// the tradeId via the v3 shop feed (the v1 /orders endpoint doesn't index primary item orders).
export async function fetchTradeForItem(contractAddress: string, itemId: string): Promise<Trade | null> {
  const { listings } = await fetchShopListingsRaw({ contractAddress, itemId, first: 1 })
  const tradeId = listings[0]?.tradeId
  return tradeId ? fetchTrade(tradeId) : null
}
