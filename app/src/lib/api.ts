import { ethers } from 'ethers'
import type { AuthIdentity } from '@dcl/crypto'
import { TradeAssetType, type Trade, type TradeCreation } from '@dcl/schemas'
import { config } from '~/config'

const NFT_V1 = `${config.marketplaceServerUrl}/v1`

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
  /**
   * The item's canonical asset URN, when the feed that produced the row carries one.
   *
   * The 3D preview needs it to load anything that is NOT a Polygon collections-v2 item: given only
   * contractAddress + itemId the preview app SYNTHESIZES `urn:decentraland:matic:collections-v2:<contract>:<itemId>`,
   * which is simply wrong for an Ethereum collections-v1 wearable (whose urn is
   * `urn:decentraland:ethereum:collections-v1:<collection>:<name>`) and fails to resolve. See
   * HoverPreviewLayer.
   *
   * Optional because only some feeds return it: /v3/catalog/items does (see lib/collections), the unified
   * feed does not — and every unified row is Polygon, so contractAddress + itemId is correct there.
   */
  urn?: string
  // Fixed credits for a USD-pegged row. ZERO on a MANA-priced row, whose credit price fluctuates: those
  // carry `manaWei` and are priced for display at the live rate — see `displayCredits`.
  priceCredits: number
  // Raw MANA price (wei) when this row is MANA-priced (legacy listings, and every row the /v2 catalog
  // serves). Null/absent on USD-pegged rows, which price in credits directly.
  manaWei?: string | null
  gender: 'male' | 'female' | 'unisex' | null
  // Smart wearable (carries an interactive scene/game.js). Surfaces a "Smart" badge on the card.
  isSmart: boolean
  /**
   * Emote playback traits, straight from the catalogue's `data.emote`. They exist for wearables too in the
   * response shape but are only ever set on emotes, so the chips key on the category rather than on absence:
   * `loop: false` is a MEANINGFUL value (play once) and must not read the same as "not an emote".
   */
  emoteLoop?: boolean
  emoteHasSound?: boolean
  emoteHasProps?: boolean
  // Present for secondary listings (a specific token on sale): the open USD-pegged trade + its token.
  // Checkout uses `tradeId` directly instead of resolving by itemId.
  tradeId?: string
  tokenId?: string
  /**
   * How this row is acquired — `undefined` means 'trade' (see ListingAcquisition).
   *
   * Lives on CatalogItem rather than only on UnifiedListing because the CART persists CatalogItems: a line
   * has to still know it is a mint when checkout resolves it, potentially in a later session. Optional for
   * the same reason — carts saved before this existed carry no value, and every one of those is a trade.
   */
  acquisition?: ListingAcquisition
  // The token's mint index within its item (e.g. "5013" → the 5013th ever minted). Present only for a
  // specific owned/secondary token; lets the UI tell otherwise-identical copies apart ("#5013").
  issuedId?: string
  // Current owner (the reseller) for a SECONDARY per-token listing, from the shop feed. Lets the PDP
  // resale list show who's selling without a per-token lookup. Absent for primary/catalog rows.
  seller?: string
  // Remaining mintable supply for a PRIMARY listing (from the shop feed, and from the /v2 catalog on
  // the by-ids path). Absent for secondary listings (a specific token has no stock concept). Surfaces
  // the STOCK figure next to the price on the item detail page.
  available?: number
  // Whether the CREATOR is still selling this item (a mint exists), as opposed to it being resale-only.
  // Populated on the /v2 by-ids path, where the mint price and the resale floor arrive as separate
  // fields; absent on feeds that report a single already-chosen listing. Outfits use it to keep a look
  // off the discovery row once any of its items can no longer be bought from its creator.
  hasPrimaryListing?: boolean
  // How many open credit-buyable listings this item has, from the item-unified browse feed
  // (/v3/catalog/unified?groupBy=item). Present only on that feed's rows; > 1 surfaces a badge on the
  // card telling the user there are more copies to see on the item detail page. Absent everywhere else.
  listingCount?: number
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
  /** The CREATOR's mint price (MANA wei). Zero/absent means the creator is no longer selling it. */
  price?: string | null
  /** Cheapest RESALE (MANA wei) — a different seller, not the creator. */
  minPrice?: string | null
  /** Remaining mintable supply. */
  available?: number
  data?: {
    wearable?: { category?: string; bodyShapes?: string[]; description?: string; isSmart?: boolean }
    emote?: { category?: string; description?: string; loop?: boolean; hasSound?: boolean; hasGeometry?: boolean }
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
  // A closed mint reports a ZERO price rather than omitting the field, so `??` would keep the '0' and
  // price the row at nothing instead of falling back to the cheapest resale.
  const mintWei = r.price && r.price !== '0' ? r.price : null
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
    // The /v2 catalog prices in MANA, not in USD — so this row carries `manaWei` and NO fixed credit
    // price. Callers convert at the live rate through `displayCredits`, exactly as the browse grid does
    // for any other MANA-priced row. (Reading `price` as USD wei is what made a 3-credit item render as
    // 150: 15 MANA ≠ $15.)
    manaWei: mintWei ?? r.minPrice ?? null,
    priceCredits: 0,
    gender: toGender(r.data?.wearable?.bodyShapes),
    isSmart: r.data?.wearable?.isSmart ?? false,
    emoteLoop: r.data?.emote?.loop,
    emoteHasSound: r.data?.emote?.hasSound,
    emoteHasProps: r.data?.emote?.hasGeometry,
    // Supply and who is selling. Both come straight off the /v2 row, and together they decide whether a
    // shopper can still buy the item FROM ITS CREATOR (a mint) rather than from a reseller. Passed
    // through undefined rather than defaulted, so a feed that omits supply keeps meaning "unknown"
    // (AssetCard reads it as an unbounded stock cap) instead of silently reading as sold out.
    available: r.available,
    hasPrimaryListing: !!mintWei
  }
}

export async function fetchCatalog({
  category = 'wearable',
  first = 24,
  skip = 0
}: { category?: string; first?: number; skip?: number } = {}): Promise<{ items: CatalogItem[]; total: number }> {
  const qs = new URLSearchParams({
    category,
    first: String(first),
    skip: String(skip),
    isOnSale: 'true',
    sortBy: 'newest',
    includeSocialEmotes: 'false'
  })
  const res = await fetch(`${config.marketplaceServerUrl}/v2/catalog?${qs.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch catalog (${res.status})`)
  const { data, total } = (await res.json()) as { data: RawCatalogItem[]; total: number }
  return { items: data.map(toCatalogItem), total: total ?? data.length }
}

// Hydrate catalog items from their marketplace item ids (`contract-itemId`) — how the favorites page
// turns the server's pick ids back into renderable items. Returned in the ids' order; ids the catalog
// no longer knows (delisted/unpublished) are silently absent. Chunked to keep URLs bounded.
export async function fetchCatalogByIds(ids: string[]): Promise<CatalogItem[]> {
  if (ids.length === 0) return []
  const CHUNK = 50
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))
  const pages = await Promise.all(
    chunks.map(async chunk => {
      // The server-side filter is a repeated `id` param (getItemsParams reads `params.getList('id')`).
      const qs = new URLSearchParams({ first: String(chunk.length) })
      for (const id of chunk) qs.append('id', id)
      const res = await fetch(`${config.marketplaceServerUrl}/v2/catalog?${qs.toString()}`)
      if (!res.ok) {
        void res.body?.cancel()
        throw new Error(`fetchCatalogByIds (${res.status})`)
      }
      const { data } = (await res.json()) as { data: RawCatalogItem[] }
      return data.map(toCatalogItem)
    })
  )
  const byId = new Map(pages.flat().map(item => [item.id, item]))
  return ids.map(id => byId.get(id)).filter((item): item is CatalogItem => !!item)
}

// The item's long description for the detail page. It isn't in the shop feed (ShopListingRaw), so read
// it from the v2 catalog by contract + itemId. Returns '' when the item has none / on any error.
export async function fetchItemDescription(contractAddress: string, itemId: string): Promise<string> {
  const qs = new URLSearchParams({ contractAddresses: contractAddress, itemId, first: '1' })
  try {
    const res = await fetch(`${config.marketplaceServerUrl}/v2/catalog?${qs.toString()}`)
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
    // A CollectionStore mint carries no tradeId, and this map exists to hand My Assets a trade it can
    // CANCEL — so a row without one is not what this describes and is skipped rather than coerced.
    if (l.listingType !== 'primary' || l.itemId == null || !l.tradeId) continue
    map[String(l.itemId)] = { isOnSale: true, priceCredits: l.priceCredits, tradeId: l.tradeId }
  }
  return map
}

// Per-TOKEN secondary sale state for a collection, from the v3 shop feed. Keyed by tokenId, carrying
// the credit price + tradeId. The indexer's /v1/nfts `order` is a legacy on-chain (MANA) field and is
// absent for a shop (USD-pegged, off-chain trade) resale, so an on-sale owned token has no credit price
// there — this resolves it from the authoritative shop feed, mirroring fetchCollectionSaleState for
// primary listings. Only USD-pegged (credit-buyable) secondary listings appear here.
export async function fetchSecondarySaleState(
  contractAddress: string
): Promise<Record<string, { priceCredits: number; tradeId: string }>> {
  const { listings } = await fetchShopListingsRaw({ contractAddress, first: 200 })
  const map: Record<string, { priceCredits: number; tradeId: string }> = {}
  for (const l of listings) {
    // Same reason as fetchCollectionSaleState: no tradeId, nothing to cancel, not this map's subject.
    if (l.listingType !== 'secondary' || l.tokenId == null || !l.tradeId) continue
    map[String(l.tokenId)] = { priceCredits: l.priceCredits, tradeId: l.tradeId }
  }
  return map
}

// Curated contract registry: every approved collection plus the marketplace's own contracts (LAND,
// Estates, Names), keyed by LOWERCASED address → name. An NFT row carries the ITEM's name and never
// its collection's, so this is the only place a collection address can be turned into a real name.
// It is one request for the whole registry rather than a lookup per address, which is what makes it
// usable for a list of collections; callers should cache it (it changes only when a collection is
// approved).
export type ContractRegistry = Map<string, string>

export async function fetchContractRegistry(): Promise<ContractRegistry> {
  const res = await fetch(`${NFT_V1}/contracts`)
  if (!res.ok) throw new Error(`fetchContractRegistry ${res.status}`)
  const { data } = (await res.json()) as { data?: Array<{ name?: string; address?: string }> }
  const byAddress: ContractRegistry = new Map()
  for (const contract of data ?? []) {
    if (!contract.address || !contract.name) continue
    byAddress.set(contract.address.toLowerCase(), contract.name)
  }
  return byAddress
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
  // NULL for a CollectionStore mint — it is not a listing and has no trade. Typed as a plain
  // `string` until now, which is why nothing flagged the `id` below as possibly null.
  tradeId: string | null
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
  // Secondary (per-token) rows only: the token's current owner (the reseller) + its mint index. Added
  // to the shop feed so the PDP resale list can show who's selling + the serial number WITHOUT an N+1
  // /v1/nfts lookup per row. Absent until the marketplace-server change ships — the PDP falls back to
  // the per-token lookup for any row still missing them (see ResellersModal).
  seller?: string
  issuedId?: string
  // Flash sale, when the shop catalog resolves this listing as on-sale: the pre-sale price (whole
  // credits) to compare against + the sale end as a unix expiration in SECONDS (the trade's
  // Checks.expiration). Absent for regular listings. See marketplace-server shop-catalog.
  compareAtCredits?: number | null
  saleEndsAt?: number | null
}

/**
 * A row's identity for the CART, which dedupes lines on `id`.
 *
 * A trade has one already. A CollectionStore MINT does not — it is not a listing, so the feed sends
 * `tradeId: null` — and taking that null as the id made every mint in the cart the SAME line: the
 * second one added found the first (`null === null`) and bumped its quantity instead of taking its
 * own row. A buyer adding three different mints got three copies of whichever landed first, and
 * never the other two. So a mint keys by what it actually is: the item being minted.
 *
 * Deliberately the same `contract-itemId` shape the /v2 catalog uses as its own id, so a mint read
 * from either feed lands on one cart line rather than two.
 */
function listingRowId(l: ShopListingRaw): string {
  if (l.tradeId) return l.tradeId
  const suffix = l.tokenId ? `t${l.tokenId}` : (l.itemId ?? '')
  return `${(l.contractAddress ?? '').toLowerCase()}-${suffix}`
}

function shopListingToItem(l: ShopListingRaw): CatalogItem {
  return {
    id: listingRowId(l),
    tradeId: l.tradeId ?? undefined,
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
    // Only meaningful for primary listings; secondary rows carry a per-token value the PDP ignores.
    available: l.listingType === 'primary' ? l.available : undefined,
    // Per-token secondary fields (reseller + mint index), when the feed provides them. The PDP prefers
    // these over its per-token /v1/nfts lookup, so once the server populates them the lookup goes away.
    seller: l.seller ?? undefined,
    issuedId: l.issuedId ?? undefined,
    // Only surface a compare-at that's actually above the sale price (the badge/strikethrough guard
    // against a stale or equal value). saleEndsAt arrives as unix seconds → ms for the UI.
    compareAtCredits:
      l.compareAtCredits != null && l.compareAtCredits > l.priceCredits ? l.compareAtCredits : undefined,
    saleEndsAt: l.saleEndsAt != null ? l.saleEndsAt * 1000 : undefined
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
  // Smart-wearables only (Figma "Smart" toggle). Omitted = no smart constraint.
  isSmart?: boolean
  // Listing status (Figma "Status" filter): true = on sale, false = not for sale, undefined = all.
  onSale?: boolean
  /**
   * Restrict to mint listings or to resales. Omitted = both.
   *
   * Filtered SERVER-side on purpose (marketplace-server /v3/catalog/unified). This feed is paginated and
   * carries a total, so dropping resale rows here would return short pages and a count that overstates
   * what is shown.
   */
  listingType?: 'primary' | 'secondary'
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
  if (params.isSmart) qs.set('isSmart', 'true')
  if (params.onSale != null) qs.set('onSale', String(params.onSale))
  if (params.listingType) qs.set('listingType', params.listingType)
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/shop?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchShopListings ${res.status}`)
  const json = (await res.json()) as { data?: ShopListingRaw[]; total?: number }
  return { listings: json.data ?? [], total: json.total ?? 0 }
}

/**
 * Re-read a CollectionStore mint's LIVE price and remaining supply, or null when it is no longer mintable.
 *
 * The mint counterpart to re-resolving a trade before charging. Both facts can move with no listing change:
 * another buyer takes the last unit, or the creator re-prices the item. Neither is pinned by a signature the
 * way a trade's price is, and `CollectionStore.buy` re-validates the price on-chain and reverts if it moved,
 * so both have to be read again at checkout rather than trusted from the cart snapshot.
 *
 * Queries the unified feed by (contract, item) and accepts the row ONLY if it still comes back as a store
 * mint. A row that has become a trade is not mintable through this path, and treating it as one would build
 * calldata for the wrong contract.
 */
export async function fetchStoreMintState(
  contractAddress: string,
  itemId: string
): Promise<{ priceWei: string; available: number } | null> {
  const { items } = await fetchUnified({ contractAddress, itemId, first: 1 })
  const row = items[0]
  if (!row || row.acquisition !== 'store' || !row.manaWei) return null
  // `available` is the remaining mintable supply the feed reports. Absent means the server did not say, and
  // guessing "plenty" here would let a sold-out item through to a revert — so treat it as none left.
  return { priceWei: row.manaWei, available: row.available ?? 0 }
}

// A single credit-buyable listing for a specific item (primary) — used to hydrate the item detail
// page on deep-link/refresh, where the route segment is the itemId. Null if it's not on sale.
export async function fetchShopListingForItem(contractAddress: string, itemId: string): Promise<CatalogItem | null> {
  const { listings } = await fetchShopListingsRaw({ contractAddress, itemId, first: 1 })
  return listings[0] ? shopListingToItem(listings[0]) : null
}

/**
 * The item's PRIMARY listing from the UNIFIED feed — native (USD-pegged) or legacy (classic MANA, converted
 * to credits server-side at the live rate), whichever exists.
 *
 * This is what the item page resolves through, and the shop-only version above is why a MANA-listed item read
 * as unlisted there: /v3/catalog/shop carries USD-pegged trades only, so an item with nothing but legacy
 * liquidity came back empty and the page fell through to "Not for sale". Measured on one such collection: the
 * shop feed returns 0 rows for it, the unified feed returns its trade with a credits price. The browse grid
 * has always read the unified feed, which is why the same item looked buyable in a card and unlisted on its
 * own page.
 *
 * The MINT answers when there is one — a page priced off someone's resale while the creator is still selling
 * would undercut the creator's own listing. But asking the server for primaries ONLY is wrong: an item whose
 * mint is sold out still has a live price, and filtering it away is the same "Not for sale" bug this function
 * exists to fix, one step further in. So both kinds are fetched and the mint is preferred here.
 */
export async function fetchUnifiedListingForItem(
  contractAddress: string,
  itemId: string
): Promise<UnifiedListing | null> {
  const { items } = await fetchUnified({ contractAddress, itemId, first: 5 })
  return pickItemListing(items)
}

/**
 * Which of an item's listings this page is about, when it has more than one.
 *
 * An item really can carry two open PRIMARY listings at different prices: a creator who re-lists in USD
 * without taking the old MANA order down leaves both live. Seen on production — one item with a 6-credit
 * USD-pegged listing and a 5-MANA legacy one open at the same time, the second of which prices at 4.
 *
 * The order is explicit rather than "whatever the feed returned first", because the feed does not promise
 * one and the grid does not depend on it: `groupBy=item` collapses server-side and picks the USD-pegged row,
 * so this page has to reach the same answer or the two disagree again on the same item.
 *
 *  1. The MINT over a resale — while the creator is still selling, the page is about THEIR listing; a resale
 *     answering here prices it off someone else's. A secondary row is the one scoped to a single token.
 *  2. Then USD-PEGGED over legacy — the creator's current intent, and its price is exact rather than
 *     oracle-derived, so it is also the number the grid collapses to.
 */
export function pickItemListing(items: UnifiedListing[]): UnifiedListing | null {
  const rank = (l: UnifiedListing) => (l.tokenId ? 1 : 0) * 2 + (l.source === 'native' ? 0 : 1)
  return [...items].sort((a, b) => rank(a) - rank(b))[0] ?? null
}

// Credit-buyable listings for the browse grid (primary + secondary, USD-pegged). All filtering
// (category, rarity, price, sub-category, search, sort) happens server-side on /v3/catalog/shop.
// Still used by the Overview drops row + the Cart upsell; the main browse grid uses fetchShopItems.
export async function fetchListings({ first = 100, ...filters }: ShopListingFilters = {}): Promise<{
  items: CatalogItem[]
  total: number
}> {
  const { listings, total } = await fetchShopListingsRaw({ ...filters, first })
  return { items: listings.map(shopListingToItem), total }
}

// The currently-open resales (secondary listings) for ONE item, cheapest-first, from the UNIFIED v3
// feed. The unified feed mixes NATIVE (USD-pegged, fixed credits) and LEGACY (classic MANA, converted
// to credits server-side at the live rate) liquidity — both are OFF-CHAIN signed trades that carry a
// `tradeId`, so BOTH are credit-buyable (see lib/buy + MarketCheckout). We keep only secondary rows (a
// specific token → `tokenId` present) that carry a `tradeId`. A native row has `manaWei: null`; a
// legacy row has `manaWei` set (drives the market/credits checkout).
//
// NOTE: the server's unified LEGACY branch is PRIMARY-ONLY (marketplace-server shop-catalog
// getUnifiedListings → unifiedBranch({ source: 'legacy', primaryOnly: true })), so in practice every
// secondary row this returns is NATIVE. The legacy branch below is kept so a legacy secondary row is
// handled correctly the moment the feed starts returning them, but it is dormant today.
export async function fetchItemResales(contractAddress: string, itemId: string): Promise<UnifiedListing[]> {
  const { items } = await fetchUnified({ contractAddress, itemId, first: 100, sortBy: 'cheapest' })
  return items.filter(i => !!i.tokenId && !!i.tradeId).sort((a, b) => a.priceCredits - b.priceCredits)
}

// A CLASSIC ON-CHAIN order for a specific item, from the marketplace /v1/orders endpoint. These come
// from the old Marketplace.sol and have NO off-chain trade (`tradeId` is empty), so the credits rail's
// useCredits(accept([trade])) genuinely can't fulfill them — they're non-buyable here. We keep ONLY
// the tradeId-less rows: /v1/orders also returns off-chain public_nft_order trades (which DO carry a
// tradeId and ARE credit-buyable), but those are surfaced as buyable resales via the unified feed, so
// including them here would double-list them. No price is exposed (they settle in MANA on the classic
// marketplace; web2-first hides MANA).
export type ClassicOrder = {
  tokenId: string
  issuedId?: string
  seller: string
  contractAddress: string
}

export async function fetchClassicItemOrders(contractAddress: string, itemId: string): Promise<ClassicOrder[]> {
  const qs = new URLSearchParams({
    contractAddress,
    itemId,
    status: 'open',
    sortBy: 'cheapest',
    first: '100'
  })
  const res = await fetch(`${config.marketplaceServerUrl}/v1/orders?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchClassicItemOrders ${res.status}`)
  const json = (await res.json()) as {
    data?: Array<{ tokenId: string; issuedId?: string; owner: string; contractAddress: string; tradeId?: string }>
  }
  return (json.data ?? [])
    .filter(o => !o.tradeId)
    .map(o => ({
      tokenId: o.tokenId,
      issuedId: o.issuedId,
      seller: o.owner,
      contractAddress: o.contractAddress
    }))
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

/**
 * How the buyer acquires the row — a SEPARATE question from how it is priced (`source`).
 *
 * - 'trade': an offchain signed order, bought with `accept([trade])`.
 * - 'store': a CollectionStore mint, bought with `CollectionStore.buy([...])`. Not a listing: no order and
 *   nothing signed, and its `tradeId` is therefore absent.
 *
 * Defaults to 'trade' when the server does not send it, so a client running against an older
 * marketplace-server keeps working instead of silently classifying every row as a mint.
 */
export type ListingAcquisition = 'trade' | 'store'

export type UnifiedListing = CatalogItem & {
  source: ListingSource
  acquisition: ListingAcquisition
  // Raw MANA wei price for legacy rows (converted to fluctuating credits in the UI); null for native.
  // A store mint is MANA-priced, so it always carries one.
  manaWei: string | null
}

type UnifiedListingRaw = ShopListingRaw & {
  source: ListingSource
  acquisition?: ListingAcquisition
  manaWei?: string | null
}

function unifiedListingToItem(l: UnifiedListingRaw): UnifiedListing {
  return {
    ...shopListingToItem(l),
    source: l.source,
    // Fall back to 'trade': every row was a trade before the store branch existed, so an older server that
    // omits the field describes trades. Defaulting the other way would route real trades down the mint path.
    acquisition: l.acquisition ?? 'trade',
    manaWei: l.manaWei ?? null
  }
}

// Shared query string for the /v3/catalog/unified feed (same params as fetchListings). `groupBy='item'`
// switches the server to ONE row per item (the browse grid); omitted keeps the default one-row-per-listing.
function unifiedSearchParams(first: number, filters: ShopListingFilters, groupBy?: 'item'): URLSearchParams {
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
  if (filters.isSmart) qs.set('isSmart', 'true')
  if (filters.onSale != null) qs.set('onSale', String(filters.onSale))
  if (filters.listingType) qs.set('listingType', filters.listingType)
  if (groupBy) qs.set('groupBy', groupBy)
  return qs
}

// The per-LISTING unified feed: native + legacy listings, one row per open trade. All filtering/sort/
// search happens server-side on /v3/catalog/unified (same params as fetchListings). Native rows render
// Add to cart at their fixed priceCredits; legacy rows render an "≈" live-rate price + Buy Now (see
// pages/Assets). Still used where a per-listing view is needed (e.g. the PDP resale column).
export async function fetchUnified({ first = 100, ...filters }: ShopListingFilters = {}): Promise<{
  items: UnifiedListing[]
  total: number
}> {
  const qs = unifiedSearchParams(first, filters)
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/unified?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchUnified ${res.status}`)
  const json = (await res.json()) as { data?: UnifiedListingRaw[]; total?: number }
  const data = json.data ?? []
  return { items: data.map(unifiedListingToItem), total: json.total ?? data.length }
}

// One item-unified row: the same shape as a UnifiedListing row plus the per-item listingCount.
type ShopItemRaw = UnifiedListingRaw & { listingCount?: number }

function shopItemToItem(l: ShopItemRaw): UnifiedListing {
  return { ...unifiedListingToItem(l), listingCount: l.listingCount }
}

// The item-unified BROWSE grid: /v3/catalog/unified?groupBy=item — ONE card per item (not per listing),
// priced primary-if-present else cheapest credit-buyable secondary, carrying a listingCount so an item
// with multiple copies shows a single card (with a "N on sale" badge) instead of one card per listing.
// Same server-side filtering/sort/search/pagination as fetchUnified; the card still deep-links to the
// PDP, which shows the full resale list.
export async function fetchShopItems({ first = 100, ...filters }: ShopListingFilters = {}): Promise<{
  items: UnifiedListing[]
  total: number
}> {
  const qs = unifiedSearchParams(first, filters, 'item')
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/unified?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchShopItems ${res.status}`)
  const json = (await res.json()) as { data?: ShopItemRaw[]; total?: number }
  const data = json.data ?? []
  return { items: data.map(shopItemToItem), total: json.total ?? data.length }
}

// Items SIMILAR to one item — the PDP's fallback rail for when the item's collection has nothing else to
// show. Rows are the same item-unified shape as fetchShopItems (one card per item, credit-priced), so the
// carousel renders them with the identical AssetCard. Similarity is decided server-side (same category,
// ordered so the closest rarity leads); the anchor item is already excluded by the endpoint.
// Unpaginated — the server caps `first`, and the response carries no total.
export async function fetchRelatedItems(
  contractAddress: string,
  itemId: string,
  { first = 10 }: { first?: number } = {}
): Promise<UnifiedListing[]> {
  const qs = new URLSearchParams({ contractAddress, itemId, first: String(first) })
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/related?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchRelatedItems ${res.status}`)
  const json = (await res.json()) as { data?: ShopItemRaw[] }
  return (json.data ?? []).map(shopItemToItem)
}

/**
 * The items TRENDING right now — what backs the home page's Trending row.
 *
 * Ranked server-side over the last day's sales (60% of the row by sale count, the rest by traded volume) and
 * returned IN that order, so the caller must not re-sort it. Rows are the same item-unified shape as
 * fetchShopItems, which is what lets the identical AssetCard render them at a real credit price.
 *
 * Both narrowing arguments are sent to the SERVER rather than applied to the result:
 *
 * - `includeSocialEmotes=false`, always. The Shop hides social emotes, and the row is a fixed number of
 *   slots — filtering after the fact would spend slots on rows that are then thrown away, shrinking the row.
 * - `listingType`, from the secondary-sales flag (see pages/Overview). Same reason.
 *
 * Unpaginated (the endpoint returns `{ data }` with no total): it is one carousel.
 */
export async function fetchTrendingItems({
  first = 12,
  listingType
}: { first?: number; listingType?: 'primary' | 'secondary' } = {}): Promise<UnifiedListing[]> {
  const qs = new URLSearchParams({ first: String(first), includeSocialEmotes: 'false' })
  if (listingType) qs.set('listingType', listingType)
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/trending?${qs.toString()}`)
  if (!res.ok) {
    // Read the body before throwing: the status alone cannot tell a 400 on a bad `first` apart from one
    // on a bad `listingType`, and this row fails silently by design (it hides itself), so the message is
    // the only place the reason survives. Best-effort — a body that cannot be read must not replace the
    // status error with a parse error.
    const detail = await res.text().catch(() => '')
    throw new Error(`fetchTrendingItems ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }
  const json = (await res.json()) as { data?: ShopItemRaw[] }
  return (json.data ?? []).map(shopItemToItem)
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
    createdAt: l.createdAt ?? 0
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
  // Mint index of this token within its item ("5013" = the 5013th minted). Distinguishes copies the
  // owner holds of the same item, so each owned card/detail can be identified individually.
  issuedId?: string
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
    issuedId?: string
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

// Maps one indexer NFT row to the flattened MyAsset shape the UI consumes. Shared by fetchMyAssets
// (the My Assets grid) and fetchOwnedToken (single-token ownership check) so the field mapping —
// including the isOnSale / listingPrice / tradeId derivation from `order` — stays in one place.
function toMyAsset(r: NFTResult): MyAsset {
  return {
    id: r.nft.id,
    contractAddress: r.nft.contractAddress,
    tokenId: r.nft.tokenId,
    issuedId: r.nft.issuedId,
    itemId: r.nft.itemId ?? null,
    name: r.nft.name,
    category: r.nft.category,
    image: r.nft.image,
    rarity: r.nft.data?.wearable?.rarity ?? r.nft.data?.emote?.rarity,
    network: r.nft.network,
    chainId: r.nft.chainId,
    isOnSale: r.order != null,
    listingPrice: r.order ? toCredits(r.order.price) : undefined,
    tradeId: r.order?.tradeId
  }
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

// Sort keys accepted by the /v1/nfts endpoint (subset we expose in My Assets — see @dcl/schemas
// NFTSortBy). Newest is the default; name + cheapest cover the rest of the My Assets sort menu.
export type MyAssetsSort = 'newest' | 'name' | 'cheapest'

export type MyAssetsFilters = {
  category?: string
  first?: number
  skip?: number
  // Free-text search over the owner's items (server-side, same `search` param the browse grid uses).
  search?: string
  // Rarity filter (repeated `itemRarity` params). Only meaningful for wearables/emotes.
  rarities?: string[]
  // On-chain wearable/emote sub-categories (from SUBCAT_MAP). Only meaningful for wearables/emotes.
  wearableCategories?: string[]
  emoteCategories?: string[]
  // Listing status: true = only items currently on sale. The endpoint has no "not for sale" flag, so
  // the caller filters the not-for-sale case client-side from each row's `isOnSale` (see MyAssets).
  onlyOnSale?: boolean
  sortBy?: MyAssetsSort
}

// The connected account's owned NFTs (wearables/emotes/names), from the indexer's /v1/nfts endpoint.
// `category` selects the section: 'wearable' | 'emote' | 'ens' (owned NAMEs). Filtering (search,
// rarity, sub-category, on-sale) + sort happen server-side; each row carries its open listing (order)
// so the UI can show "on sale" + take a listing down. Paginated by cumulative offset (see useInfiniteGrid).
export async function fetchMyAssets(
  owner: string,
  {
    category = 'wearable',
    first = 48,
    skip = 0,
    search,
    rarities,
    wearableCategories,
    emoteCategories,
    onlyOnSale,
    sortBy = 'newest'
  }: MyAssetsFilters = {}
): Promise<{ assets: MyAsset[]; total: number }> {
  const qs = new URLSearchParams({
    owner: owner.toLowerCase(),
    category,
    first: String(first),
    skip: String(skip),
    sortBy,
    orderDirection: 'desc'
  })
  if (search) qs.set('search', search)
  for (const r of rarities ?? []) qs.append('itemRarity', r)
  for (const c of wearableCategories ?? []) qs.append('wearableCategory', c)
  for (const c of emoteCategories ?? []) qs.append('emoteCategory', c)
  if (onlyOnSale) qs.set('isOnSale', 'true')
  const res = await fetch(`${NFT_V1}/nfts?${qs.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch assets (${res.status})`)
  const { data, total } = (await res.json()) as { data: NFTResult[]; total: number }

  const assets = data.map(toMyAsset)

  return { assets, total }
}

// Ownership + listing state of ONE specific token for a viewer. The item detail page uses it to decide
// whether to show owner-management actions (List / Update price / Remove) for a secondary NFT the
// connected wallet holds. Hits the same /v1/nfts endpoint (filtered by owner + token) fetchMyAssets
// uses and maps the single row to a MyAsset — so it carries isOnSale + the open trade id (to cancel).
// Returns null when the viewer doesn't own that token, or on any error (treat as "not the owner").
export async function fetchOwnedToken(
  owner: string,
  contractAddress: string,
  tokenId: string
): Promise<MyAsset | null> {
  try {
    const qs = new URLSearchParams({ owner: owner.toLowerCase(), contractAddress, tokenId, first: '1' })
    const res = await fetch(`${NFT_V1}/nfts?${qs.toString()}`)
    if (!res.ok) return null
    const { data } = (await res.json()) as { data: NFTResult[] }
    const r = data?.[0]
    // Guard on the token id too: the endpoint filters server-side, but never claim ownership of a
    // token the response didn't actually match (defensive against a loose/again-cached row).
    if (!r || r.nft.tokenId !== tokenId) return null
    const asset = toMyAsset(r)
    // The indexer's `order.price` can be transiently null/0 for a live listing (the secondary-listings
    // materialized view lags the trade). That would show the OWNER a "0" price for their own listing on
    // the PDP. When the token is on sale but carries no usable price, resolve it authoritatively from
    // the signed trade's received amount (USD-pegged → credits) so a live listing never reads 0.
    if (asset.isOnSale && asset.tradeId && !asset.listingPrice) {
      try {
        const trade = await fetchTrade(asset.tradeId)
        const amount = (trade.received?.[0] as { amount?: string } | undefined)?.amount
        const credits = toCredits(amount)
        if (credits > 0) asset.listingPrice = credits
      } catch {
        // Keep the (missing) price rather than fail the whole ownership check — the manage view still
        // works; the price just stays unresolved until the next refetch.
      }
    }
    return asset
  } catch {
    return null
  }
}

// How many copies of an ITEM the viewer owns — powers the item page's "You own N of this" note. Hits
// the same /v1/nfts endpoint filtered by owner + itemId and reads the server-side `total` (first: 1, we
// only need the count). Best-effort: any error → 0 so the note simply doesn't show.
export async function fetchOwnedItemCount(owner: string, contractAddress: string, itemId: string): Promise<number> {
  try {
    const qs = new URLSearchParams({ owner: owner.toLowerCase(), contractAddress, itemId, first: '1' })
    const res = await fetch(`${NFT_V1}/nfts?${qs.toString()}`)
    if (!res.ok) return 0
    const { total } = (await res.json()) as { total?: number }
    return typeof total === 'number' ? total : 0
  } catch {
    return 0
  }
}

// Seller + issued number for a specific listed token, resolved from the indexer's /v1/nfts endpoint.
// The unified shop feed (fetchItemResales) carries NEITHER — it's a per-trade projection with no owner
// or mint index — so the resale rows resolve these client-side, per visible (paginated) token. Seller
// = the token's current owner (the reseller); issuedId = its mint index ("#N"). Best-effort: any miss
// returns empty so a row still renders (without the seller line / with the generic label) rather than
// fabricating a value.
export type ResaleTokenInfo = { seller?: string; issuedId?: string }

export async function fetchResaleTokenInfo(contractAddress: string, tokenId: string): Promise<ResaleTokenInfo> {
  try {
    const qs = new URLSearchParams({ contractAddress, tokenId, first: '1' })
    const res = await fetch(`${NFT_V1}/nfts?${qs.toString()}`)
    if (!res.ok) return {}
    const { data } = (await res.json()) as {
      data?: Array<{ nft?: { tokenId?: string; issuedId?: string; owner?: string }; order?: { owner?: string } | null }>
    }
    const row = data?.[0]
    // Never attribute a seller/issued number from a row the endpoint didn't actually match on tokenId.
    if (!row?.nft || row.nft.tokenId !== tokenId) return {}
    return { seller: row.nft.owner ?? row.order?.owner, issuedId: row.nft.issuedId }
  } catch {
    return {}
  }
}

// Batched seller/issued lookup for the VISIBLE (paginated) resale rows only — never the whole unbounded
// resale set. Returns a tokenId → info map; missing/failed tokens are simply absent.
export async function fetchResaleTokenInfos(
  contractAddress: string,
  tokenIds: string[]
): Promise<Record<string, ResaleTokenInfo>> {
  const entries = await Promise.all(
    tokenIds.map(async id => [id, await fetchResaleTokenInfo(contractAddress, id)] as const)
  )
  return Object.fromEntries(entries)
}

// PUBLIC lookup of ONE specific token by (contract, tokenId) — NOT scoped to a viewer/owner. Powers
// deep links / refreshes / shared URLs of a secondary token's detail page: unlike fetchOwnedToken this
// resolves for anyone (logged out, or a viewer who doesn't own the token), so the page renders instead
// of falling through to a "Not Found" stub. Same /v1/nfts row → MyAsset mapping, so it carries the
// token's open listing (isOnSale + listingPrice + tradeId) when it's on sale. Returns null if the token
// doesn't exist or on any error.
export async function fetchTokenById(contractAddress: string, tokenId: string): Promise<MyAsset | null> {
  try {
    const qs = new URLSearchParams({ contractAddress, tokenId, first: '1' })
    const res = await fetch(`${NFT_V1}/nfts?${qs.toString()}`)
    if (!res.ok) return null
    const { data } = (await res.json()) as { data: NFTResult[] }
    const r = data?.[0]
    // The endpoint filters server-side, but only trust a row that actually matches the requested token.
    if (!r || r.nft.tokenId !== tokenId) return null
    return toMyAsset(r)
  } catch {
    return null
  }
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
  // Consume/cancel the body before throwing: 404 is the expected fast-path for stale trade IDs (a cart
  // with several stale lines hits it repeatedly), so an unread stream would leak connections (Jarvis P2).
  if (res.status === 404) {
    void res.body?.cancel()
    throw new TradeNotFoundError(tradeId)
  }
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
/**
 * Item metadata from the v1 items endpoint. Also the ONLY source of two fields the item detail page needs:
 *
 *  - `utility` — the creator's description of what the item unlocks. The v3 catalog does not carry it at
 *    all, which is why the Shop showed no utility anywhere; the marketplace reads it from here too.
 *  - `isSmart` — nested under `data.wearable`. It does reach the page through the collection feed, but not
 *    on every path into it (a direct URL starts from a stub), so reading it here makes the badge
 *    independent of how the visitor arrived.
 */
export type ItemMeta = {
  name?: string
  thumbnail?: string
  isSmart: boolean
  utility: string | null
  /** The canonical asset urn, straight from the server — no need to rebuild one from contract + itemId. */
  urn: string | null
}

export async function fetchItemMeta(contractAddress: string, itemId: string): Promise<ItemMeta | null> {
  const qs = new URLSearchParams({ contractAddress, itemId, first: '1' })
  const res = await fetch(`${NFT_V1}/items?${qs.toString()}`)
  if (!res.ok) return null
  const { data } = (await res.json()) as {
    data: Array<{
      name?: string
      thumbnail?: string
      utility?: string | null
      urn?: string
      data?: { wearable?: { isSmart?: boolean } }
    }>
  }
  const row = data?.[0]
  if (!row) return null
  return {
    name: row.name,
    thumbnail: row.thumbnail,
    isSmart: !!row.data?.wearable?.isSmart,
    // Blank-but-present is the same as absent for rendering; normalise here so no caller has to trim.
    utility: row.utility?.trim() || null,
    urn: row.urn ?? null
  }
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
  // The off-chain Trade API returns the sold asset's id in `itemId` (COLLECTION_ITEM / primary) or
  // `tokenId` (ERC721 / secondary); ONLY the on-chain serialization uses a generic `value`. Reading
  // `value` off the API trade (as this did) always yielded `undefined` → an empty id → the metadata
  // endpoints silently ignored the empty filter and returned the collection's default-first item (or
  // nothing), which is exactly why purchases showed a generic "Item" with no image. Prefer the typed
  // fields, keep `value` as a last-resort fallback for any on-chain-shaped trade.
  const sent = trade.sent?.[0] as
    { assetType?: number; contractAddress?: string; itemId?: string; tokenId?: string; value?: string } | undefined
  const priceAsset = trade.received?.[0] as { amount?: string } | undefined
  const credits = toCredits(priceAsset?.amount)
  const contractAddress = sent?.contractAddress ?? ''
  const id = sent?.itemId ?? sent?.tokenId ?? sent?.value ?? ''
  if (!contractAddress) return { name: 'Item', thumbnail: '', credits, contractAddress: '' }

  if (sent?.assetType === TradeAssetType.COLLECTION_ITEM) {
    // Guard the empty-id case: an empty `itemId` filter matches the whole collection, so `first:1`
    // would return an unrelated item. Better to fall back cleanly than to show the wrong wearable.
    const meta = id ? await fetchItemMeta(contractAddress, id) : null
    return { name: meta?.name ?? 'Item', thumbnail: meta?.thumbnail ?? '', credits, contractAddress, itemId: id }
  }
  const meta = id ? await fetchNftMeta(contractAddress, id) : null
  return {
    name: meta?.name ?? (id ? `#${id}` : 'Item'),
    thumbnail: meta?.image ?? '',
    credits,
    contractAddress,
    tokenId: id
  }
}

// Open credit-buyable listing (Trade) for a catalog ITEM (primary/mint), or null if none. Resolves
// the tradeId via the v3 shop feed (the v1 /orders endpoint doesn't index primary item orders).
export async function fetchTradeForItem(contractAddress: string, itemId: string): Promise<Trade | null> {
  // UNIFIED, not shop: a legacy MANA listing is absent from the shop feed, and resolving through it is what
  // made a MANA-listed item unbuyable on its own page. See fetchUnifiedListingForItem.
  const listing = await fetchUnifiedListingForItem(contractAddress, itemId)
  return listing?.tradeId ? fetchTrade(listing.tradeId) : null
}

// Name + thumbnail for a sold asset (a secondary sale carries a tokenId; a primary/mint sale an
// itemId). Reuses the same metadata endpoints the purchase-history resolver uses so the Activity feed
// renders sale rows the same way it renders purchases. Falls back gracefully — an unresolvable row
// still shows a generic name rather than crashing. `credits` is unused here (a sale carries its own
// settlement price); it's kept only so the shape matches PurchaseDisplay.
export async function fetchAssetDisplay(
  contractAddress: string,
  { tokenId, itemId }: { tokenId?: string | null; itemId?: string | null }
): Promise<PurchaseDisplay | null> {
  if (!contractAddress) return null
  if (tokenId) {
    const meta = await fetchNftMeta(contractAddress, tokenId)
    return { name: meta?.name ?? `#${tokenId}`, thumbnail: meta?.image ?? '', credits: 0, contractAddress, tokenId }
  }
  if (itemId) {
    const meta = await fetchItemMeta(contractAddress, itemId)
    return { name: meta?.name ?? 'Item', thumbnail: meta?.thumbnail ?? '', credits: 0, contractAddress, itemId }
  }
  return null
}

// A completed secondary sale the connected account took part in (marketplace-server /v1/sales). Note
// secondary sales settle in MANA (not credits), so `manaWei` is the on-chain price — the Activity feed
// converts it to INDICATIVE credits at the live display rate (see lib/activity + lib/mana-rate).
export type SaleRecord = {
  id: string
  buyer: string
  seller: string
  contractAddress: string
  tokenId: string
  itemId: string | null
  manaWei: string
  createdAt: number // epoch MS (the API already returns ms)
  txHash: string
  category: string
}

type RawSale = {
  id: string
  buyer: string
  seller: string
  contractAddress: string
  tokenId: string
  itemId: string | null
  price: string
  timestamp: number
  txHash: string
  category?: string
}

function toSaleRecord(s: RawSale): SaleRecord {
  return {
    id: s.id,
    buyer: s.buyer,
    seller: s.seller,
    contractAddress: s.contractAddress,
    tokenId: s.tokenId,
    itemId: s.itemId ?? null,
    manaWei: s.price,
    createdAt: s.timestamp,
    txHash: s.txHash,
    category: s.category ?? ''
  }
}

// The connected account's completed secondary sales, newest first. `role` picks the side: 'seller' =
// items the user sold, 'buyer' = items the user bought on the secondary market. Public GET (no auth);
// paginated by cumulative offset (see useInfiniteGrid). Prices are MANA wei.
export async function fetchUserSales(
  address: string,
  { role = 'seller', first = 24, skip = 0 }: { role?: 'seller' | 'buyer'; first?: number; skip?: number } = {}
): Promise<{ items: SaleRecord[]; total: number }> {
  const qs = new URLSearchParams({
    [role]: address.toLowerCase(),
    first: String(first),
    skip: String(skip),
    sortBy: 'recently_sold'
  })
  const res = await fetch(`${config.marketplaceServerUrl}/v1/sales?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchUserSales ${res.status}`)
  const json = (await res.json()) as { data?: RawSale[]; total?: number }
  const items = (json.data ?? []).map(toSaleRecord)
  return { items, total: json.total ?? items.length }
}
