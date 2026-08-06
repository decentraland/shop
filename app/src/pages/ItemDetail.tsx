import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Rarity } from '@dcl/schemas'
import { config } from '~/config'
import { useCart } from '~/store/cart'
import { useFavorite, useFavorites } from '~/store/favorites'
import { useWallet } from '~/store/wallet'
import { stashResumeIntent, takeResumeIntent } from '~/lib/auth-return'
import {
  fetchUnifiedListingForItem,
  fetchTradeForItem,
  fetchItemResales,
  fetchItemDescription,
  fetchItemMeta,
  fetchOwnedToken,
  fetchOwnedItemCount,
  fetchTokenById,
  fetchTrade,
  type CatalogItem,
  type LegacyListing,
  type UnifiedListing
} from '~/lib/api'
import { itemIdFromTokenId } from '~/lib/token-id'
import { liveTradeId, markListingCancelled } from '~/lib/dead-listings'
import { patchManageCaches } from '~/lib/manage-cache'
import { manaWeiToCredits } from '~/lib/mana-convert'
import { isSaleSectionLoading } from '~/lib/pdp-loading'
import { cancelListing, GaslessCancelFailedError } from '~/lib/buy'
import { fetchPublishableItems, fetchItemVideoUrl, type PublishableItem } from '~/lib/builder'
import { fetchVrmExportBlocked } from '~/lib/wearable-rules'
import { BuyModal } from '~/components/BuyModal'
import { SellModal } from '~/components/SellModal'
import { TransferModal } from '~/components/TransferModal'
import { PrimaryListModal } from '~/components/PrimaryListModal'
import { IssueModal } from '~/components/IssueModal'
import { VideoShowcaseModal } from '~/components/VideoShowcaseModal'
import { MarketCheckout } from '~/components/MarketCheckout'
import { toast } from '~/store/toast'
import { captureError } from '~/lib/monitoring'
import { friendlyError, isRejection } from '~/lib/errors'
import { isManagedWallet } from '~/lib/wallet'
import { canPayGasItself } from '~/lib/wallet-kind'
import { useManaRate } from '~/hooks/useManaRate'
import { useSuggestedItems } from '~/hooks/useSuggestedItems'
import { useSeo } from '~/hooks/useSeo'
import { shortAddress } from '~/lib/address'
import { t } from '~/intl/i18n'
import { fetchCollection } from '~/lib/collections'
import { ItemPreview } from '~/components/ItemPreview'
import { CollectionCarousel } from '~/components/CollectionCarousel'
import { ResellersModal } from '~/components/ResellersModal'
import { useSecondarySales } from '~/hooks/useSecondarySales'
import { NotifyMe } from '~/components/NotifyMe'
import { isNotifyAvailable } from '~/lib/notify'
// import { MakeOfferButton } from '~/components/MakeOfferButton' // see the CTA block below
import { Tooltip } from '~/components/Tooltip'
import { ErrorNotice } from '~/components/ErrorNotice'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { rarityColor, rarityDescription } from '~/lib/rarity'
import { categoryIcon, genderIcon } from '~/lib/itemIcons'
import { saleDiscountPct } from '~/lib/sale'
import { useSaleActive } from '~/hooks/useSaleActive'
import { track, itemProps } from '~/lib/analytics'
import { recordViewed } from '~/lib/recently-viewed'
import { isOwnListing } from '~/lib/ownership'
import * as S from './ItemDetail.styles'

function isValidRarity(r: string): r is Rarity {
  return (Object.values(Rarity) as string[]).includes(r)
}

function genderLabel(gender: CatalogItem['gender']): string | null {
  if (gender === 'male') return t('itemDetail.genderMale')
  if (gender === 'female') return t('itemDetail.genderFemale')
  if (gender === 'unisex') return t('itemDetail.genderUnisex')
  return null
}

// Human label for the category chip: the specific wearable/emote sub-category when known
// (e.g. "eyewear" → "eyewear", uppercased by CSS), else the broad Wearable/Emote.
function categoryLabel(item: CatalogItem): string {
  if (item.wearableCategory) return item.wearableCategory.replace(/_/g, ' ')
  return item.category === 'emote' ? t('itemDetail.categoryEmote') : t('itemDetail.categoryWearable')
}

export function ItemDetail() {
  // TWO routes render this page (see App.tsx): /item/:contractAddress/:itemId (generic buy view) and
  // /token/:contractAddress/:tokenId (a specific copy). react-router populates whichever param matched.
  const {
    contractAddress,
    itemId: routeItemId,
    tokenId: routeTokenId
  } = useParams<{
    contractAddress: string
    itemId?: string
    tokenId?: string
  }>()
  const isTokenRoute = !!routeTokenId
  // The itemId this page is about: the route itemId, or decoded from the token (itemId = tokenId >> 216).
  // Both routes fetch the generic item data (name, resales, siblings, description) by this itemId.
  const pageItemId = routeItemId ?? itemIdFromTokenId(routeTokenId) ?? null
  const location = useLocation() as {
    pathname: string
    state?: {
      item?: CatalogItem
      tradeId?: string
      resumeBuy?: boolean
      // Market mode: a legacy/MANA item navigated from the collectibles grid. The item carries
      // `manaWei` (it's a UnifiedListing); `marketPriceCredits` is the grid's indicative credit price.
      market?: boolean
      marketPriceCredits?: number | null
    }
  }
  const state = location.state
  const navigate = useNavigate()

  // Market (legacy/MANA) mode is decided entirely by the router state the grid passes — there's no
  // authoritative shop-listing to fall back to (legacy items aren't in the USD-pegged feed).
  // DEAD PATH, pending removal. Nothing produces this state any more: the browse card used to navigate
  // with `{ market: true }` for a legacy (MANA-priced) row, and now that the cart can price those, every
  // card navigates with the plain `{ item, tradeId }` shape. So `isMarket` is always false and everything
  // it gates below — the "≈" price, MarketCheckout, the never-Add-to-cart branch — is unreachable. Left in
  // place deliberately rather than ripped out in the same change as the rewiring: it threads through the
  // CTA branch and deserves its own diff. ResellersModal still opens MarketCheckout directly (behind the
  // secondary-sales flag), which is why that component survives.
  const isMarket = !!state?.market
  const marketPriceCredits = state?.marketPriceCredits ?? null

  const qc = useQueryClient()
  const add = useCart(s => s.add)
  const cartItems = useCart(s => s.items)
  const toggleFav = useFavorites(s => s.toggle)
  const { session, signIn } = useWallet()
  // Managed (web2) wallets sign transparently (no popup); self-custody wallets (MetaMask,
  // WalletConnect…) show a confirmation prompt. Used to word the Edit-price "cancel first" step
  // appropriately: "confirm in your wallet" vs a plain "canceling…" progress state. Shared helper so
  // the classification stays consistent with the buy/sell modals (lib/wallet).
  const isManaged = isManagedWallet(session)

  // The currently-displayed item. Seeded from router state (fast path from the grid); swapped in place
  // when a carousel sibling is tapped (no full reload). Falls back to a stub for deep links/refresh
  // (name/thumbnail/price then fill in from the collection fetch below).
  const [current, setCurrent] = useState<CatalogItem>(() => {
    if (state?.item) {
      const seed = { ...state.item, tradeId: state.tradeId ?? state.item.tradeId }
      // Pin identity to the ROUTE, not the passed state: on the item route force tokenId undefined (a
      // stale link could hand over a token-carrying item — it must NOT put a specific token on the
      // generic page); on the token route pin the exact tokenId. This is what kills the wrong-item bug.
      return isTokenRoute
        ? { ...seed, tokenId: routeTokenId, itemId: seed.itemId ?? pageItemId }
        : { ...seed, tokenId: undefined, itemId: routeItemId ?? seed.itemId }
    }
    return {
      id: `${contractAddress}-${routeTokenId ?? routeItemId}`,
      name: '',
      creator: '',
      contractAddress: contractAddress ?? '',
      itemId: pageItemId,
      category: 'wearable',
      rarity: 'common',
      network: 'MATIC',
      chainId: config.chainId,
      thumbnail: '',
      priceCredits: 0,
      gender: null,
      isSmart: false,
      tokenId: routeTokenId ?? undefined,
      tradeId: state?.tradeId
    }
  })

  const [showBuy, setShowBuy] = useState(false)
  // Returning from a Stripe top-up started in the buy modal (no-funds flow): auto-open the modal in
  // resume mode so it finishes the purchase with the newly-bought credits.
  const [resumeBuy, setResumeBuy] = useState(!!state?.resumeBuy)
  useEffect(() => {
    if (state?.resumeBuy) setShowBuy(true)
  }, [state?.resumeBuy])

  // Buy now: signed in → open the checkout; signed out → into sign-in (returns to this exact page)
  // instead of a dead-end. For a shop item we stash a resume so the buy modal reopens and completes on
  // return; a legacy/market item's mode lives in router state (lost on the full-page redirect), so it
  // just lands back here signed in.
  function handleBuyNow() {
    if (session) {
      setShowBuy(true)
      return
    }
    if (!isMarket) stashResumeIntent({ type: 'item-buy', path: location.pathname })
    signIn()
  }

  // Resume the buy after a sign-in round-trip (shop items). Match on the pathname so we only reopen for
  // the item the buyer actually clicked. Fires once, after the session is restored.
  const buyResumedRef = useRef(false)
  useEffect(() => {
    if (!session || buyResumedRef.current) return
    const intent = takeResumeIntent('item-buy')
    if (!intent || intent.path !== location.pathname) return
    buyResumedRef.current = true
    setResumeBuy(true)
    setShowBuy(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // The rail below the fold: this collection's other items, padded with the creator's and then with
  // similar ones so it never shows up as two or three lonely cards. `siblings` also backfills the item.
  const {
    items: carouselItems,
    isCollectionOnly,
    siblings,
    siblingsFetched
  } = useSuggestedItems({
    id: current.id,
    contractAddress: current.contractAddress,
    itemId: current.itemId ?? pageItemId,
    tokenId: current.tokenId,
    creator: current.creator
  })

  // Hydrate the generic item (name, price, tradeId, stock) from the shop feed by its ITEM id. Resolved
  // by `pageItemId` — the route itemId, or the itemId DECODED from the token on the token route. This is
  // the bug fix: the old code fed the raw route segment (a tokenId on a secondary URL) to
  // fetchShopListingForItem, which treats its 2nd arg as an itemId → the server matched nothing and
  // returned the collection's first listing (a WRONG item) on a cold load. Never pass a tokenId here.
  // Also runs when a seeded item (grid nav / sibling) is missing its stock (`available`) so the
  // authoritative listing can backfill it. Resolved through the UNIFIED feed so a LEGACY (MANA) listing
  // counts as much as a native one — reading the shop-only feed here is what made a MANA-listed item show
  // "Not for sale" on its own page while its card in the grid showed a price.
  // ITEM ROUTE ONLY: the token route hydrates from the specific token (ownedAsset / publicToken) and
  // must not be overwritten by the generic item listing (which carries no tokenId).
  const needsPrimaryStock = current.available == null && !current.tokenId
  const { data: deepLinkItem, isLoading: deepLinkLoading } = useQuery({
    queryKey: ['shop-item', current.contractAddress, pageItemId],
    enabled:
      !isMarket && !isTokenRoute && !!current.contractAddress && !!pageItemId && (!state?.item || needsPrimaryStock),
    // Money-sensitive: a 3rd party's listing/price/stock can change under us. Never serve the 30s-stale
    // default — revalidate on every (re)mount and tab refocus so a soft revisit re-checks availability.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: () => fetchUnifiedListingForItem(current.contractAddress, pageItemId as string)
  })
  useEffect(() => {
    if (!deepLinkItem) return
    setCurrent(prev => {
      // Bare deep-link stub (no tradeId yet) → full hydrate from the authoritative listing.
      if (!prev.tradeId) return { ...deepLinkItem }
      // Seeded item (grid/sibling): keep its identity/price/name/tradeId, only backfill the
      // authoritative fields it lacked (stock + wearableCategory) — never clobber the rest.
      if (prev.available != null && prev.wearableCategory) return prev
      return {
        ...prev,
        available: prev.available ?? deepLinkItem.available,
        wearableCategory: prev.wearableCategory ?? deepLinkItem.wearableCategory
      }
    })
  }, [deepLinkItem])

  // Item long description — not in the shop feed, so read from the v2 catalog by contract + itemId.
  // Collapsed to a few lines by default with a read-more toggle.
  const [descExpanded, setDescExpanded] = useState(false)
  const { data: description = '' } = useQuery({
    queryKey: ['item-desc', current.contractAddress, current.itemId],
    enabled: !!current.contractAddress && !!current.itemId,
    staleTime: 5 * 60_000,
    queryFn: () => fetchItemDescription(current.contractAddress, current.itemId as string)
  })

  // Collection name — item records don't carry it (it lives on the collections entity), so resolve it
  // by contract for the "Collection" badge shown beside the creator (see Figma 1052-151285).
  const { data: collection, isLoading: collectionLoading } = useQuery({
    queryKey: ['collection-meta', current.contractAddress],
    enabled: !!current.contractAddress,
    staleTime: 5 * 60_000,
    queryFn: () => fetchCollection(current.contractAddress)
  })

  // Backfill the creator — item stubs/rows (deep-link, owned-token, sibling) frequently lack it, so the
  // PDP + Sell modal would otherwise show no creator. Prefer the authoritative shop listing's creator,
  // else the collection's (both already fetched — no extra request). Never clobber a creator we have.
  useEffect(() => {
    const resolved = deepLinkItem?.creator || collection?.creator
    if (!resolved) return
    setCurrent(prev => (prev.creator ? prev : { ...prev, creator: resolved }))
  }, [deepLinkItem, collection])

  // Fallback backfill: if still unhydrated (e.g. not currently on sale), fill from the matching
  // sibling once the collection resolves. Skip it when the authoritative shop listing (deepLinkItem)
  // is available — that carries the fields siblings lack (stock, wearableCategory) and would otherwise
  // be clobbered if both resolve in the same React batch (the guard below reads a stale `current`).
  // ITEM ROUTE ONLY: the token route hydrates from the specific token (ownedAsset / publicToken), so a
  // generic catalog sibling (which has no tokenId) must never replace it.
  // Derived rather than computed inside the effect so `hydrationPending` below can see it: "a sibling is
  // about to hydrate this page" has to be readable during the render BEFORE the effect applies it.
  const siblingMatch = useMemo(() => {
    if (isTokenRoute || current.name || deepLinkItem || siblings.length === 0) return undefined
    return (
      (pageItemId ? siblings.find(s => s.itemId === pageItemId) : undefined) ??
      siblings.find(s => s.contractAddress === current.contractAddress)
    )
  }, [isTokenRoute, current.name, current.contractAddress, deepLinkItem, siblings, pageItemId])
  useEffect(() => {
    if (!siblingMatch) return
    setCurrent(prev => ({ ...siblingMatch, tradeId: prev.tradeId ?? siblingMatch.tradeId }))
  }, [siblingMatch])

  // Resolve a buyable trade for the current item (needed for BUY NOW + a valid cart entry). Secondary
  // listings carry their tradeId directly; catalog items resolve the cheapest open listing by itemId.
  const { data: resolvedTradeId, isLoading: resolvingTrade } = useQuery({
    queryKey: ['detail-trade', current.id, current.tradeId, current.contractAddress, current.itemId],
    enabled: !!current.contractAddress,
    // Money-sensitive: buyability can flip when a 3rd party buys/lists/cancels. Always revalidate on
    // remount + focus rather than serving the 30s-stale default (see shop-item above).
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<string | null> => {
      if (current.tradeId) return current.tradeId
      // Item route only: resolve the cheapest open listing by itemId. On a TOKEN route the buyable trade
      // is the token's OWN listing (carried on current.tradeId from ownedAsset/publicToken) — never the
      // item-level fallback, which would resurrect a stale "for sale" after the token's listing is
      // cancelled (the stale-price / stuck-listed bug).
      if (!isTokenRoute && current.itemId) {
        const trade = await fetchTradeForItem(current.contractAddress, current.itemId)
        return trade?.id ?? null
      }
      return null
    }
  })

  /**
   * Smart-wearable traits, from the v1 items endpoint — the only one that carries `utility` (the v3 catalog
   * omits it entirely, which is why the Shop showed none of this). `isSmart` is read here too rather than
   * trusted from `current`: arriving by URL starts the page from a stub whose isSmart is false, so the badge
   * would have depended on how the visitor got here.
   *
   * Presentation only, so it is allowed to be slow and to fail quietly: no badge is the same as no utility.
   */
  const { data: itemTraits } = useQuery({
    queryKey: ['item-traits', current.contractAddress, pageItemId],
    enabled: !!current.contractAddress && !!pageItemId,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: () => fetchItemMeta(current.contractAddress, pageItemId as string)
  })
  // `??`, not `||`: once this query answers it is the authority, so a `false` from it must not fall through
  // to a possibly-stale `true` on the stub the page started from. Only "still loading" defers to `current`.
  const isSmart = itemTraits?.isSmart ?? current.isSmart
  const utility = itemTraits?.utility ?? null

  /**
   * VRM export, when the creator blocked it. `blockVrmExport` lives on the wearable's Catalyst entity and on no
   * marketplace endpoint, so it costs its own lookup — worth it because it is a restriction the buyer inherits:
   * they will not be able to take this item out to a VRM avatar. Stated exactly as the marketplace states it,
   * badge and tooltip both. Wearables only, and only once the urn is known.
   */
  const itemUrnFromMeta = itemTraits?.urn ?? null
  const { data: vrmBlocked } = useQuery({
    queryKey: ['item-vrm', itemUrnFromMeta],
    enabled: !!itemUrnFromMeta && current.category === 'wearable',
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: () => fetchVrmExportBlocked(itemUrnFromMeta as string)
  })

  /**
   * The creator's showcase clip, for smart wearables that ship one. A smart wearable's point is what it DOES
   * in world, and neither the 3D preview (the garment, standing still) nor the thumbnail can show that — the
   * marketplace surfaces the same clip from the same place (its getSmartWearableVideoShowcase).
   *
   * Gated on the resolved `isSmart` above — not on the seeded `current.isSmart`, which is false on a deep
   * link until the feed answers — so an ordinary wearable never pays for the lookup: a plain wearable has no
   * clip, and this is a builder round-trip per page view. Failure and "no clip uploaded" are the same outcome
   * (no button), so it doesn't retry and never surfaces an error.
   */
  const [showVideo, setShowVideo] = useState(false)
  const { data: showcaseVideo } = useQuery({
    queryKey: ['item-video', current.contractAddress, pageItemId],
    enabled: isSmart && !!current.contractAddress && !!pageItemId,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: () => fetchItemVideoUrl(current.contractAddress, pageItemId as string)
  })

  // Both sources are filtered through the session's cancelled listings (see lib/dead-listings): the feed's
  // materialized view lags behind a take-down, so `current.tradeId` (seeded from a grid row that predates it)
  // and the resolved trade can both still name a listing we know is dead. Without that filter the page keeps
  // offering the listing it just cancelled until a full reload.
  /**
   * Emote playback traits, from whichever row actually carries them.
   *
   * `current` is seeded from the shop feed, and /v3/catalog/shop is FLAT — no `data` object at all, so no
   * loop / hasSound / hasGeometry. The backfill below cannot help either: it bails out once `current.name`
   * is set, which it always is when you arrive from the grid. /v3/catalog/items does return them, and the
   * sibling list is already fetched from it, so the row for THIS item is the source.
   *
   * Read at render time and narrowly — only these three fields — rather than merged into `current`, which
   * the authoritative deep-link row owns and must not be clobbered by a generic catalogue sibling.
   */
  const emoteTraits = useMemo(() => {
    if (current.emoteLoop !== undefined) return current
    const match = pageItemId ? siblings.find(sib => sib.itemId === pageItemId) : undefined
    return match ?? current
  }, [current, siblings, pageItemId])

  const buyableTradeId = liveTradeId(qc, current.tradeId) ?? liveTradeId(qc, resolvedTradeId)
  /**
   * A COLLECTION-STORE MINT is for sale and has no trade — it is minted straight from the store contract,
   * so no tradeId will ever exist for it. Defining "for sale" as "has a trade" is what made this page say
   * NOT FOR SALE about an item the browse grid was selling from the same feed, at a price the grid showed
   * and this page did not (measured on production: `acquisition: 'store'`, 48 in stock, 20 MANA).
   *
   * Both CTAs below serve it: the cart routes the store rail (lib/cart-availability, lib/cart-checkout) and so
   * does Buy now (BuyModal resolves either kind through lib/cart-checkout's resolveLine and settles it through
   * the store's own rails), so a mint and a listing offer the buyer exactly the same purchase.
   */
  const isStoreMint = current.acquisition === 'store' && (current.available ?? 0) > 0
  const forSale = !!buyableTradeId || isStoreMint

  // Cheapest open resale for this item — powers the "Lowest Price" line + resellers link (Figma
  // 1524-297513). Shares react-query's cache with <ResellersModal> (identical key), so no extra fetch.
  const secondarySales = useSecondarySales()
  const { data: resales = [] } = useQuery({
    queryKey: ['item-resales', current.contractAddress, current.itemId],
    // Not fetched at all while resales are hidden: everything downstream of it (the "Lowest Price" line,
    // the resellers modal, the buy-the-cheapest-resale CTA on a sold-out item) resolves to empty from here,
    // so there is one switch rather than a condition per surface.
    enabled: secondarySales && !isMarket && !!current.contractAddress && !!current.itemId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: () => fetchItemResales(current.contractAddress, current.itemId as string)
  })
  const lowestResale = resales.length > 0 ? resales[0].priceCredits : null

  /**
   * The shop's own listing for THIS exact token. The token hydration paths take their money fields from
   * the legacy MANA order on /v1/nfts, and a shop listing is an off-chain USD-pegged TRADE that never
   * appears there — so a shop-listed token arrived with priceCredits 0 while the resolved trade still
   * made it buyable. The unified feed (already fetched for the resellers list, same cache key) is where
   * that price actually lives. No extra request.
   */
  const shopListingForToken =
    isTokenRoute && current.tokenId ? (resales.find(r => r.tokenId === current.tokenId) ?? null) : null

  // The cheapest resale as a cart/buy-ready item (Figma 1524-298906 sold-out state buys the resale).
  // Backfills the display fields secondary rows lack from the PDP item, mirroring <ResellersModal>.
  const cheapestResaleItem: CatalogItem | null = useMemo(() => {
    const r = resales[0]
    if (!r) return null
    return {
      ...r,
      name: r.name || current.name,
      thumbnail: r.thumbnail || current.thumbnail,
      rarity: r.rarity || current.rarity,
      category: r.category || current.category,
      wearableCategory: r.wearableCategory ?? current.wearableCategory,
      gender: r.gender ?? current.gender
    }
  }, [resales, current])
  const [buyResale, setBuyResale] = useState<CatalogItem | null>(null)
  const [showResellers, setShowResellers] = useState(false)

  // Market (legacy) checkout: the live MANA→USD rate (read only in market mode) + the LegacyListing
  // projection MarketCheckout expects, built from the UnifiedListing the grid passed in router state.
  // The price is only indicative until MarketCheckout locks it at authorize (see MarketCheckout).
  /**
   * A LEGACY (MANA-priced) listing is priced at the LIVE oracle rate, never at the server's snapshot.
   *
   * The unified feed reports a `priceCredits` for legacy rows too, and it is not the price the buyer pays:
   * measured on production, a 25-MANA emote came back as 5 credits while the live rate makes it 17 — and 17
   * is what checkout authorizes. The browse grid has always converted client-side for exactly this reason
   * (see Assets.tsx), so a card showed 17 and this page showed 5 for the same item, depending on whether you
   * arrived from the grid (which passes its live-rate item in router state) or opened the URL cold.
   */
  const listedManaWei = (current as Partial<UnifiedListing>).manaWei ?? null
  const { data: manaRate } = useManaRate(isMarket || !!listedManaWei)
  const liveLegacyCredits = listedManaWei && manaRate ? manaWeiToCredits(listedManaWei, manaRate) : null
  useEffect(() => {
    if (liveLegacyCredits == null) return
    setCurrent(prev => (prev.priceCredits === liveLegacyCredits ? prev : { ...prev, priceCredits: liveLegacyCredits }))
  }, [liveLegacyCredits])
  const marketListing: LegacyListing | null = useMemo(() => {
    if (!isMarket || !state?.item) return null
    const it = state.item as UnifiedListing
    if (!it.manaWei) return null
    return {
      tradeId: it.tradeId ?? it.id,
      listingType: 'primary',
      contractAddress: it.contractAddress,
      itemId: it.itemId ?? '',
      name: it.name,
      thumbnail: it.thumbnail,
      rarity: it.rarity,
      category: it.category,
      wearableCategory: it.wearableCategory ?? null,
      creator: it.creator,
      manaWei: it.manaWei,
      available: 1,
      network: it.network,
      chainId: it.chainId,
      createdAt: 0
    }
  }, [isMarket, state?.item])
  const canBuyMarket = isMarket && marketPriceCredits != null && !!manaRate && !!marketListing
  // Live sale-active flag (collapses the badge/strikethrough/discount the moment the window closes).
  // Kept up here with the other hooks so it's never called after an early return.
  const saleActive = useSaleActive({
    priceCredits: current.priceCredits,
    compareAtCredits: current.compareAtCredits,
    saleEndsAt: current.saleEndsAt
  })
  // The exact CatalogItem shape checkout expects (tradeId + tokenId), identical to fetchListings output.
  const cartItem: CatalogItem = useMemo(
    () => ({ ...current, tradeId: buyableTradeId, id: buyableTradeId ?? current.id }),
    [current, buyableTradeId]
  )
  const inCart = cartItems.some(i => i.id === cartItem.id)
  // Quantity support is PRIMARY-only: a primary (mint) line can hold multiple copies up to stock, so
  // Add-to-cart stays enabled and re-clicking adds another. A secondary listing is a single unique
  // token (tokenId), so it keeps the add-once ("In cart") behaviour.
  const isPrimary = !cartItem.tokenId
  const cartQty = cartItems.find(i => i.id === cartItem.id)?.quantity ?? 0
  const atStockCap = isPrimary && typeof current.available === 'number' && cartQty >= current.available
  const { key: favKey, faved } = useFavorite(current)

  // KR5 denominator: fire 'Shop Viewed Item' once per hydrated item (deduped across re-renders and the
  // in-place carousel swaps), after the trade resolves so `for_sale` is accurate.
  const viewedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!current.name || resolvingTrade || viewedRef.current === current.id) return
    viewedRef.current = current.id
    track('Shop Viewed Item', { ...itemProps(current), for_sale: forSale })
    recordViewed(current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, current.name, resolvingTrade, forSale])

  // Navigating PDP→PDP (tapping a carousel <AssetCard>, which routes here via its own whole-card link)
  // reuses this same component instance — the useState initializer above only runs on the first mount,
  // so re-seed the shown item from the freshly-passed router state and scroll back to the top. Skips
  // the initial route (already seeded) so it never clobbers in-flight hydration on a deep link.
  const routeKey = `${contractAddress}/${routeTokenId ?? routeItemId}`
  const seededRoute = useRef(routeKey)
  useEffect(() => {
    if (seededRoute.current === routeKey) return
    seededRoute.current = routeKey
    if (state?.item) {
      const seed = { ...state.item, tradeId: state.tradeId ?? state.item.tradeId }
      // Same route-pinned identity as the initial seed: never let a token onto the item page.
      setCurrent(
        isTokenRoute
          ? { ...seed, tokenId: routeTokenId, itemId: seed.itemId ?? pageItemId }
          : { ...seed, tokenId: undefined, itemId: routeItemId ?? seed.itemId }
      )
    }
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  function handleAddToCart() {
    if (!forSale || own || resolvingTrade) return
    // Secondary: only ever one copy of a unique token. Primary: don't exceed remaining stock.
    if (!isPrimary && inCart) return
    if (atStockCap) return
    add(cartItem, 'item_detail')
  }

  const rarity: Rarity = isValidRarity(current.rarity) ? current.rarity : Rarity.COMMON
  const gender = genderLabel(current.gender)
  const catIco = categoryIcon(current)
  const genderIco = genderIcon(current.gender)
  const onSale = forSale && saleActive
  // Only a rail made up ENTIRELY of the collection's items can be titled after the collection and offer a
  // "View all" into it; the moment it is padded, both would be describing items that aren't there.
  const carouselTitle = isCollectionOnly ? t('itemDetail.moreFromCollection') : t('itemDetail.youMightAlsoLike')

  // Your own (primary) listing — you can't buy it (see lib/ownership.ts). Secondary self-listings are
  // caught authoritatively at buy time by isOwnTrade.
  const own = isOwnListing(current, session?.address)

  // ---- Owner / creator management -----------------------------------------------------------------
  // Two roles manage this item instead of buying it:
  //  • CREATOR of a PRIMARY (mint) listing they published — `own` (isOwnListing) already flags it.
  //  • OWNER of a SECONDARY token they hold — resolved by querying the connected wallet's holding of
  //    this exact token (also reports whether it's listed + the trade id to take it down).
  const [showSell, setShowSell] = useState(false)
  const [showPrimary, setShowPrimary] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  // Creator "Issue copies" modal — assign fresh copies of your own published item to wallets (gasless).
  const [showIssue, setShowIssue] = useState(false)
  // Optimistic just-listed price: the owned-token feed lags a moment behind a fresh (re)list, so show the
  // price the SellModal just submitted immediately, then let the authoritative ownedAsset refetch take
  // over (cleared below once it reports the matching listing). Bridges the MV lag on the Edit-price flow.
  const [justListedCredits, setJustListedCredits] = useState<number | null>(null)
  // Which manage action is in flight, so ONLY its button shows a working label (Update price shouldn't
  // read "Working…" while a Remove is running, and vice-versa). null = idle.
  const [managing, setManaging] = useState<'update' | 'remove' | null>(null)
  const [manageError, setManageError] = useState<string | null>(null)
  // The relay did not get the cancellation confirmed. Holds the choice open — pay the gas now, or leave it —
  // instead of spending the seller's gas behind their back (see cancelListing's `mode`).
  // null when nothing failed. 'pending' means the relay may still land, 'reverted' that it provably did
  // not — the two need different words, and only one of them may say "it may still go through".
  const [gaslessCancelFailed, setGaslessCancelFailed] = useState<null | 'pending' | 'reverted'>(null)
  // Whether the gas-paying route is a route AT ALL for this seller. A managed wallet holds no POL, so
  // offering it a "pay the fee" button leads to an INSUFFICIENT_FUNDS revert — and the fee/network wording
  // around it is what these users must never be shown. Same question the checkout surfaces ask.
  const canPayGas = canPayGasItself(session?.providerType)
  // Shown once the wait passes the point where "a moment" stops being true, so the spinner explains itself.
  const [cancelSlow, setCancelSlow] = useState(false)

  const { data: ownedAsset, isLoading: ownedAssetLoading } = useQuery({
    queryKey: ['owned-token', current.contractAddress, current.tokenId, session?.address],
    enabled: !isMarket && !!session?.address && !!current.contractAddress && !!current.tokenId,
    // Money-sensitive: this token's listing state can change under us — revalidate on remount + focus.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: () =>
      session ? fetchOwnedToken(session.address, current.contractAddress, current.tokenId as string) : null
  })

  // Deep-link / refresh of a SECONDARY owned token: the route segment is a tokenId (NOT an itemId), so
  // the primary shop-listing hydrate + sibling fallback above can't resolve it and `current` stays a
  // bare stub (empty name → Not Found). Fill the view from the owner's authoritative holding of THIS
  // exact token once it resolves, so the page renders the copy (and its per-token manage actions). Only
  // when nothing else hydrated `current`; for an already-seeded item just backfill the issued number.
  useEffect(() => {
    if (!ownedAsset) return
    setCurrent(prev => {
      // Already hydrated: still REFRESH the token's money/listing fields from a newer ownedAsset. After an
      // Edit-price (cancel → relist) or a Remove, the price + trade change; without this the old value
      // (e.g. 999) stuck because the effect short-circuited on `prev.name` and never re-read them. Clearing
      // tradeId when the listing is gone also flips the page back to "not for sale" (no stale price behind
      // the modal). This is the fix for the stale-price / stuck-"listed" bug.
      if (prev.name) {
        return {
          ...prev,
          issuedId: prev.issuedId ?? ownedAsset.issuedId,
          priceCredits: ownedAsset.listingPrice ?? 0,
          tradeId: ownedAsset.tradeId
        }
      }
      return {
        id: ownedAsset.id,
        name: ownedAsset.name,
        creator: '',
        contractAddress: ownedAsset.contractAddress,
        itemId: ownedAsset.itemId,
        category: ownedAsset.category,
        rarity: ownedAsset.rarity ?? 'common',
        network: ownedAsset.network,
        chainId: ownedAsset.chainId,
        thumbnail: ownedAsset.image,
        priceCredits: ownedAsset.listingPrice ?? 0,
        gender: null,
        isSmart: false,
        tokenId: ownedAsset.tokenId,
        issuedId: ownedAsset.issuedId,
        tradeId: ownedAsset.tradeId
      }
    })
  }, [ownedAsset])

  // Backfill the token's price (and its trade) from the shop's listing for that exact copy. Runs after the
  // hydration effects above so it corrects whatever the legacy-order path left at 0.
  useEffect(() => {
    if (!shopListingForToken) return
    setCurrent(prev => {
      if (prev.priceCredits === shopListingForToken.priceCredits && prev.tradeId) return prev
      return {
        ...prev,
        priceCredits: shopListingForToken.priceCredits,
        tradeId: prev.tradeId ?? shopListingForToken.tradeId
      }
    })
  }, [shopListingForToken])

  // Drop the optimistic just-listed price once the authoritative feed reports the matching live listing.
  useEffect(() => {
    if (justListedCredits == null) return
    if (ownedAsset?.isOnSale && ownedAsset.listingPrice === justListedCredits) setJustListedCredits(null)
  }, [ownedAsset, justListedCredits])

  // PUBLIC deep-link fallback for a SECONDARY token: when the segment is a tokenId that neither the
  // primary itemId hydrate (deepLinkItem) nor a sibling matched, AND the owner-scoped owned-token query
  // didn't resolve it (viewer is logged out, or doesn't own this token), resolve the token publicly so
  // the page renders for ANYONE (shared links, refresh, non-owners) instead of a "Not Found" stub. Only
  // fires once those paths have settled empty; harmless on an itemId URL (no token matches → null).
  const publicTokenEnabled =
    !isMarket &&
    !!current.contractAddress &&
    !!current.tokenId &&
    !current.name &&
    !deepLinkItem &&
    !ownedAssetLoading &&
    !ownedAsset
  const { data: publicToken, isFetched: publicTokenFetched } = useQuery({
    queryKey: ['public-token', current.contractAddress, current.tokenId],
    enabled: publicTokenEnabled,
    // Money-sensitive: a 3rd party can buy/relist this token — revalidate on remount + focus.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: () => fetchTokenById(current.contractAddress, current.tokenId as string)
  })

  useEffect(() => {
    if (!publicToken) return
    setCurrent(prev => {
      if (prev.name) return prev.issuedId ? prev : { ...prev, issuedId: publicToken.issuedId }
      return {
        id: publicToken.id,
        name: publicToken.name,
        creator: '',
        contractAddress: publicToken.contractAddress,
        itemId: publicToken.itemId,
        category: publicToken.category,
        rarity: publicToken.rarity ?? 'common',
        network: publicToken.network,
        chainId: publicToken.chainId,
        thumbnail: publicToken.image,
        priceCredits: publicToken.listingPrice ?? 0,
        gender: null,
        isSmart: false,
        tokenId: publicToken.tokenId,
        issuedId: publicToken.issuedId,
        tradeId: publicToken.tradeId
      }
    })
  }, [publicToken])

  // The creator's builder record for this primary item — needed to open PrimaryListModal (it carries
  // the collection name, remaining supply, and minter prereq). Only fetched for your own primary item.
  const { data: publishableItem } = useQuery({
    queryKey: ['publishable-item', current.contractAddress, current.itemId, session?.address],
    enabled: own && !!session && !!current.itemId,
    queryFn: async (): Promise<PublishableItem | null> => {
      if (!session) return null
      const items = await fetchPublishableItems(session.address, session.identity)
      return (
        items.find(
          p =>
            p.contractAddress.toLowerCase() === current.contractAddress.toLowerCase() &&
            p.blockchainItemId === current.itemId
        ) ?? null
      )
    }
  })

  // Secondary (token-owner) management is a TOKEN-ROUTE-ONLY affordance: Edit/Remove/Transfer act on a
  // SPECIFIC token, so they only ever show on /token/:tokenId for a token the viewer actually owns.
  // Owning copies never flips the generic /item page into manage mode (that showed the wrong actions —
  // the item page always stays the buy view and instead surfaces a "you own N" note). See lib/routes
  // canManageToken. `ownedAsset` only resolves on the token route anyway (current.tokenId is undefined
  // on the item route), but gate explicitly so the intent is unmistakable.
  // Owning the token and being ALLOWED TO SELL it are two different questions, and conflating them was a
  // bug: with secondary sales off the owner fell through to the buyer view and was offered "Notify me when
  // available" and "Make an offer" for a token already in their own wallet. Ownership alone decides the
  // manage surface; `canPutOnSale` below decides whether the listing CTA is part of it.
  const manageAsSecondary = isTokenRoute && !!ownedAsset
  // Primary (creator) management of a mint listing is item-level — it belongs on the /item page only.
  const manageAsPrimary = !isTokenRoute && own
  // Never over the market (legacy) flow — legacy items aren't managed through the shop's trade flows.
  const manage = !isMarket && (manageAsPrimary || manageAsSecondary)
  // Listed? Secondary uses the token's authoritative order; primary uses the resolved buyable trade.
  const manageListed = justListedCredits != null ? true : manageAsSecondary ? !!ownedAsset?.isOnSale : forSale
  const manageTradeId = manageAsSecondary ? ownedAsset?.tradeId : buyableTradeId
  // Can we open the list/relist modal? Need the backing record the modal reads its inputs from.
  const canOpenListModal = manageAsSecondary ? !!ownedAsset : !!publishableItem
  /**
   * May this viewer put the asset up for sale? A creator's mint listing is PRIMARY and always allowed; an
   * owned token is a SECONDARY sale and so is gone while the flag is off.
   *
   * Taking an existing listing DOWN stays available either way — hiding the entrance must not trap the
   * people already inside. But CHANGING THE PRICE is not an exit: `updatePrice` cancels and re-lists, so it
   * creates a brand-new secondary listing. Gating only the first listing let the flag be walked around by
   * anyone who already had one, which is why this now guards both entrances and leaves only Remove.
   *
   * With no listing and no permission the owner simply keeps Transfer.
   */
  const canPutOnSale = manageAsPrimary || (manageAsSecondary && secondarySales)
  // The owner's own listed price, from the (freshly-refreshed) manage state. Used so the price shows
  // right after listing: the public `forSale`/feed the price block falls back to lags behind the MV
  // refresh, which left the owner staring at "Not for sale" while the manage buttons already said listed.
  const managePriceCredits = justListedCredits ?? (manageAsSecondary ? (ownedAsset?.listingPrice ?? 0) : 0)

  // Item route only: how many copies of THIS item the viewer owns, for the "You own N of this" note.
  // The item page never manages a token, so this replaces the (removed) secondary-manage leak with a
  // gentle pointer to My Assets. Cheap (reads the server-side total).
  const { data: ownedItemCount = 0 } = useQuery({
    queryKey: ['owned-item-count', current.contractAddress, routeItemId, session?.address],
    enabled: !isTokenRoute && !isMarket && !!session?.address && !!current.contractAddress && !!routeItemId,
    staleTime: 30_000,
    queryFn: () => (session ? fetchOwnedItemCount(session.address, current.contractAddress, routeItemId as string) : 0)
  })

  async function refreshManage() {
    await Promise.all([
      // Scope to THIS token (prefix match), not every owned-token query in the cache.
      qc.invalidateQueries({ queryKey: ['owned-token', current.contractAddress, current.tokenId] }),
      qc.invalidateQueries({ queryKey: ['detail-trade'] }),
      qc.invalidateQueries({ queryKey: ['shop-item'] }),
      qc.invalidateQueries({ queryKey: ['collection-sale-state'] }),
      // NOTE: My Assets reads its owned-card sale state from ['my-assets'] + ['secondary-sale-state'].
      // We deliberately do NOT invalidate those here: patchManageCaches (called right after this) writes
      // the new sale state into both optimistically, which bumps their dataUpdatedAt so they read as
      // fresh. Invalidating them would flip on react-query's isInvalidated flag, and since My Assets
      // unmounts while this PDP is open, it would refetch the (eventually-consistent) shop feed on the
      // way back — the MV lags a moment, so that refetch reads back the STALE "not for sale" row and
      // clobbers the optimistic patch (the bug where a fresh PDP listing still showed "NOT FOR SALE" in
      // My Assets). The optimistic write stands and reconciles naturally when it next goes stale (30s) or
      // is refetched. The removed listing / transfer paths patch these caches the same way.
      // A secondary list / remove here changes this item's lowest resale price, which the browse + catalog
      // grids derive per card — refresh them so a returning browse card doesn't show a stale lowest price.
      qc.invalidateQueries({ queryKey: ['shop-items'] }),
      qc.invalidateQueries({ queryKey: ['catalog-items'] }),
      qc.invalidateQueries({ queryKey: ['publishable-items'] }),
      // The PDP's OWN creator record is keyed 'publishable-item' (singular) — a different key from My
      // Assets' 'publishable-items' (plural) above, so it must be invalidated explicitly or the
      // list/relist modal reads a stale record after listing your own primary from here.
      qc.invalidateQueries({ queryKey: ['publishable-item', current.contractAddress, current.itemId] }),
      // The secondary listings table lives on this same PDP — refresh it so a just-cancelled/updated
      // row of your own doesn't linger until its staleTime lapses.
      qc.invalidateQueries({ queryKey: ['item-resales', current.contractAddress, current.itemId] })
    ])
  }

  // Take the current listing down (invalidates its signature on-chain). Mirrors My Assets' cancel flow.
  // `silent` skips the "no longer for sale" toast when this is the first half of an Update price
  // (cancel-then-relist — see updatePrice).
  // `own` (default true): this call owns the 'remove' working state. Update price calls it with
  // own:false — that flow owns the 'update' state so takeDown must not stomp it.
  async function takeDown(opts: { silent?: boolean; own?: boolean; payGas?: boolean } = {}): Promise<boolean> {
    const own = opts.own !== false
    if (!session || !manageTradeId) return false
    setManageError(null)
    setGaslessCancelFailed(null)
    setCancelSlow(false)
    if (own) setManaging('remove')
    try {
      const trade = await fetchTrade(manageTradeId)
      await cancelListing({
        trade,
        signer: session.signer,
        // Ask before spending their gas: 'gasless-only' reports back instead of opening a second wallet
        // prompt on its own. `payGas` is the seller answering yes, from inside their own click — which is
        // also what makes the wallet accept the network request the direct path needs.
        mode: opts.payGas ? 'direct' : 'gasless-only',
        watch: {
          // The listing being gone is the promise we made; the relayer's hash is not (it re-sends with a new
          // one). Asking the feed keeps "confirmed" and "what the seller will see" the same thing.
          isCancelled: async () => {
            if (!current.itemId) return false
            const live = await fetchTradeForItem(current.contractAddress, current.itemId).catch(() => undefined)
            return live !== undefined && live?.id !== manageTradeId
          },
          onWaiting: elapsed => setCancelSlow(elapsed > 20_000)
        }
      })
      if (!opts.silent) toast.success(t('myAssets.removedFromSale', { name: current.name }))
      // Optimistically flip this token to NOT-for-sale everywhere it's rendered (PDP owned-token, the My
      // Assets grid, the shop-feed price map) the instant the cancel confirms — the feed's MV lags, so an
      // invalidate→refetch alone would read back the STALE still-listed price (previously it only
      // corrected on the next window focus). Runs for the silent edit-price cancel too, so the old listing
      // disappears immediately before the relist modal reopens. refreshManage then reconciles.
      setJustListedCredits(null)
      // Retire the trade so nothing can offer it back while the MV catches up: patchManageCaches below only
      // reaches the TOKEN-scoped caches, and no-ops entirely without a tokenId — i.e. never on the /item
      // route, where a creator's primary listing lives in this page's own item state instead.
      markListingCancelled(qc, manageTradeId)
      // …and drop it from that state, so the buyable-trade query stops short-circuiting on a dead id and can
      // resolve whatever replaces it (the re-list half of an Edit price, say).
      setCurrent(prev => (prev.tradeId === manageTradeId ? { ...prev, tradeId: undefined } : prev))
      void refreshManage()
      patchManageCaches(
        qc,
        { address: session.address, contractAddress: current.contractAddress, tokenId: current.tokenId },
        { kind: 'removed' }
      )
      return true
    } catch (e) {
      const rejected = isRejection(e)
      if (!rejected) captureError(e, { flow: 'remove-listing', tradeId: manageTradeId })
      if (e instanceof GaslessCancelFailedError) {
        // Offer the gas-paying route either way, but say which situation it is: a reverted relay is dead and
        // paying gas is the real next step, while an unconfirmed one may still land on its own — and telling
        // someone that about a revert is simply false.
        setGaslessCancelFailed(e.definitive ? 'reverted' : 'pending')
        return false
      }
      // Through friendlyError so a wrong network or a wallet that refused the request says which of those
      // it was — "couldn't remove the listing" is true but useless when the fix is a network switch.
      setManageError(rejected ? t('getCredits.errorCanceled') : friendlyError(e, t('myAssets.removeListingError')))
      return false
    } finally {
      if (own) setManaging(null)
      setCancelSlow(false)
    }
  }

  function openListModal() {
    if (manageAsSecondary) setShowSell(true)
    else setShowPrimary(true)
  }

  // Update price: the shop's listings are independent signed trades (unlike the classic marketplace's
  // single order slot that a re-list overwrites), so re-listing WITHOUT cancelling would leave the old
  // price still fulfillable. Take the current listing down first, then open the list modal to re-list
  // at the new price — both halves are the shop's existing, tested flows.
  async function updatePrice() {
    setManaging('update')
    try {
      const ok = await takeDown({ silent: true, own: false })
      if (ok) openListModal()
    } finally {
      setManaging(null)
    }
  }

  // Modal closed (after a successful list or a cancel) → refresh the management state so the view
  // reflects the new listing / price.
  function closeManageModal() {
    setShowSell(false)
    setShowPrimary(false)
    void refreshManage()
  }

  const addLabel = !forSale
    ? t('itemDetail.notForSale')
    : resolvingTrade
      ? t('itemDetail.checking')
      : atStockCap
        ? t('itemDetail.maxInCart')
        : !isPrimary && inCart
          ? t('assetCard.inCart')
          : t('assetCard.addToCart')

  // Stock (primary/mint listings only): the shop feed carries the remaining mintable supply. Secondary
  // listings (a specific token) have no stock concept, so we hide it there (see Figma 1052-151285).
  const showStock = typeof current.available === 'number' && current.available > 0 && !current.tokenId && !isMarket
  // Primary (mint) listing whose supply is exhausted → surface "OUT OF STOCK" next to the not-for-sale
  // price (Figma 1182-203305). Only when we actually know the remaining supply is 0 (secondary tokens
  // and market items have no stock concept).
  const outOfStock = !isMarket && !current.tokenId && current.available === 0
  // Sold-out primary that still has resellers (Figma 1524-298906): show the original (struck) + resale
  // price block and let the buyer buy the cheapest resale, instead of the plain out-of-stock/notify state.
  const soldOutWithResale = outOfStock && !manage && !!cheapestResaleItem
  const resaleInCart = !!cheapestResaleItem && cartItems.some(i => i.id === cheapestResaleItem.id)
  // Both action buttons present (buyable, not managed by you): on mobile they collapse into a sticky
  // row of a wide Buy-now + a compact cart icon (see Figma 1182-194973). A market item has only Buy now.
  const dualCta = !manage && forSale && !isMarket
  // Whether the CTA block below holds anything a visitor can actually act on — which is what earns it the
  // fixed bottom bar on mobile. A market item has Buy now; a listing you don't manage has buy/add-cart, or
  // the cheapest resale of a sold-out primary, or the notify-me form. Its LAST branch can render nothing
  // but the permanently disabled "coming soon" offer button (notify-me hides itself when no shop-server is
  // configured), and pinning a shadowed bar to the bottom of the screen for that is pure noise.
  const hasActionableCta =
    isMarket || (!manage && (forSale || (soldOutWithResale && !!cheapestResaleItem) || isNotifyAvailable()))

  // Nothing hydrated the item (bad/stale deep link, or an item that isn't in the shop feed — e.g. a
  // legacy/market piece). Once every resolution path has settled and there's still no name, show a
  // graceful not-found instead of a permanent "Loading…" blank.
  // Also wait on the owned-token lookup while it's still resolving and nothing else has hydrated the
  // item yet — otherwise a secondary deep-link would flash Not Found before ownership backfills it.
  // A source that has RESOLVED but whose data hasn't landed in `current` yet. Every hydration path here
  // applies its result in an effect, so there is always one render where the query reports "fetched" and
  // the name is still blank — long enough to paint Not Found over a perfectly good item. Loading flags
  // alone cannot close that window; the presence of unapplied data can.
  // `siblingMatch` is one of those sources: the collection read reports "fetched" a render before its
  // backfill effect lands, which is exactly the window a cold deep link was painting Not Found in.
  const hydrationPending = !current.name && (!!deepLinkItem || !!ownedAsset || !!publicToken || !!siblingMatch)
  const stillResolving =
    deepLinkLoading ||
    (!!current.contractAddress && !siblingsFetched) ||
    (!current.name && ownedAssetLoading) ||
    hydrationPending ||
    // The public-token fallback is the only path that hydrates a token for someone who does NOT own it,
    // and it starts LAST — it waits for the owner-scoped query to settle empty first. Without this a
    // buyer opening a /token/… link had a window with nothing flagged as loading and a blank name.
    // `isFetched` (not isLoading) is what keeps a genuinely missing token from hanging forever.
    (publicTokenEnabled && !publicTokenFetched)
  const notFound = !current.name && !stillResolving

  // Sale section (price + CTAs): render skeletons — never the "not for sale / notify / make offer"
  // fallback — until the sale/ownership/price state can actually be concluded (see lib/pdp-loading).
  const saleSectionLoading =
    !!current.name &&
    isSaleSectionLoading({
      isMarket,
      forSale,
      priceKnown: (current.priceCredits > 0 && (!listedManaWei || liveLegacyCredits != null)) || manage,
      // A legacy row whose live price has not landed yet is STILL RESOLVING, not settled: without this the
      // "everything has settled" branch below concludes the section and paints the server's snapshot for a
      // moment — the 5 that this whole fix is about, flashed before the 17.
      stillResolving: stillResolving || (!!listedManaWei && liveLegacyCredits == null),
      manage,
      soldOutWithResale,
      resolvingTrade,
      isTokenRoute,
      ownedAssetLoading,
      deepLinkLoading
    })

  // Creator/collection badges: skeleton while the address/name is still being resolved (both are
  // backfilled from the shop listing + collection fetch), so the meta row keeps its height. A genuinely
  // absent creator/collection (settled, still empty) simply shows nothing rather than a hanging shimmer.
  const creatorPending = !current.creator && (deepLinkLoading || collectionLoading || ownedAssetLoading)
  const collectionPending = !collection?.name && collectionLoading

  // Per-page SEO. Called unconditionally (before the not-found early return) so hook order stays stable
  // across renders. The title is set ONLY once the item hydrates (`current.name`) so a deep-link/refresh
  // stub never flashes a misleading title; the not-found state sets its own title and is de-indexed. The
  // description prefers the item's real long description, else a generated fallback. og:image uses the
  // item thumbnail only when it's an absolute URL — otherwise the hook falls back to the default image.
  const thumbAbsolute = /^https?:\/\//i.test(current.thumbnail)
  useSeo(
    notFound
      ? { title: t('seo.item.notFoundTitle'), noindex: true }
      : current.name
        ? {
            title: current.name,
            description:
              description ||
              t('seo.item.fallbackDescription', {
                name: current.name,
                rarity: current.rarity,
                category: categoryLabel(current),
                creator: shortAddress(current.creator)
              }),
            image: thumbAbsolute ? current.thumbnail : undefined,
            type: 'product'
          }
        : {}
  )

  if (notFound) {
    return (
      <S.NotFound data-notfound>
        <S.NotFoundIco name="cart" />
        <S.NotFoundTitle>{t('itemDetail.notAvailableTitle')}</S.NotFoundTitle>
        <S.NotFoundBody>{t('itemDetail.notAvailableBody')}</S.NotFoundBody>
        <S.NotFoundCta variant="white" onClick={() => navigate('/items')}>
          {t('notFound.cta')}
        </S.NotFoundCta>
      </S.NotFound>
    )
  }

  return (
    <S.Detail>
      <S.Crumbs aria-label={t('itemDetail.breadcrumbAria')}>
        <S.CrumbLink onClick={() => navigate('/items')}>{t('nav.collectibles')}</S.CrumbLink>
        <S.CrumbSep>/</S.CrumbSep>
        <S.CrumbCurrent>{current.name || t('itemDetail.itemFallback')}</S.CrumbCurrent>
      </S.Crumbs>

      <S.Main>
        <S.Preview data-testid="item-preview">
          {/* Mount the preview only once the item's identity is resolved (deep-link/refresh hydrate a
              stub first) so the 3D iframe mounts ONCE with the right item — no stub→hydrated remount /
              double-load. Show the same loader meanwhile. */}
          {current.name ? (
            <ItemPreview item={current} />
          ) : (
            <S.PreviewLoading aria-busy="true" aria-label={t('itemPreview.loading')}>
              <span className="skeleton" aria-hidden />
            </S.PreviewLoading>
          )}
          {/* Mobile favourite heart: a circular button at the preview's top-right (Figma 1182-195410).
              Shares the fav state with the title-row heart, which hides on mobile (ItemDetail.styles.ts) so
              only one is ever in the a11y tree. */}
          {favKey ? (
            <S.Fav
              data-fav-preview
              data-on={faved || undefined}
              onClick={() => toggleFav(current)}
              aria-pressed={faved}
              aria-label={faved ? t('assetCard.removeFromFavorites') : t('assetCard.addToFavorites')}
            >
              <Icon name={faved ? 'heart-solid' : 'heart'} size={18} />
            </S.Fav>
          ) : null}
          {/* Over the preview, where the marketplace puts it: the clip is about this render, not about the
              purchase, so it belongs to the viewer rather than to the info column. */}
          {showcaseVideo ? (
            <S.PlayShowcase data-play-showcase onClick={() => setShowVideo(true)} data-testid="play-showcase">
              <Icon name="play" size={18} />
              {t('itemDetail.playShowcase')}
            </S.PlayShowcase>
          ) : null}
        </S.Preview>

        <S.Info data-testid="item-info">
          {!current.name ? (
            <ItemInfoSkeleton />
          ) : (
            <>
              <S.InfoHead>
                {/* Token route: append the specific copy's mint index to the title (e.g. "Ruby Red
                    Fascinator #1") so the owner/viewer sees exactly which copy this page is about. The
                    generic /item route has no single issuedId, so the title stays the plain item name there. */}
                <S.Title>
                  {current.name}
                  {isTokenRoute && current.issuedId ? ` #${current.issuedId}` : ''}
                </S.Title>
                {favKey ? (
                  <S.Fav
                    data-fav-title
                    data-on={faved || undefined}
                    onClick={() => toggleFav(current)}
                    aria-pressed={faved}
                    aria-label={faved ? t('assetCard.removeFromFavorites') : t('assetCard.addToFavorites')}
                  >
                    <Icon name={faved ? 'heart-solid' : 'heart'} size={18} />
                  </S.Fav>
                ) : null}
              </S.InfoHead>

              <S.Chips>
                <S.DetailChip
                  data-variant="rarity"
                  style={{ background: rarityColor(rarity) }}
                  title={rarityDescription(current.rarity)}
                >
                  {current.rarity}
                </S.DetailChip>
                <S.DetailChip>
                  {catIco ? <Icon name={catIco} size={18} /> : null}
                  {categoryLabel(current)}
                </S.DetailChip>
                {gender ? (
                  <S.DetailChip>
                    {genderIco ? <Icon name={genderIco} size={18} /> : null}
                    {gender}
                  </S.DetailChip>
                ) : null}
                {/* Which specific copy this is (the mint index). Only shown when the title itself
                    doesn't already carry it: on the /token route the heading is "Name #N", so the
                    chip would be redundant — it's kept only for the generic /item view. */}
                {!isTokenRoute && current.issuedId ? (
                  <S.DetailChip data-testid="detail-issued">#{current.issuedId}</S.DetailChip>
                ) : null}
                {/* Smart wearable, and whether it unlocks something — the same two badges the marketplace
                    shows, from the same two fields (`data.wearable.isSmart` and `utility`). */}
                {isSmart ? (
                  <S.DetailChip data-testid="detail-smart">
                    <Icon name="smart" size={18} />
                    {t('itemDetail.smart')}
                  </S.DetailChip>
                ) : null}
                {/* Emote playback traits — the same three the marketplace's emote detail shows, from the same fields
                    (data.emote loop / hasSound / hasGeometry). loop is deliberately tri-state: false means play-once,
                    which is a fact worth stating, so only undefined — i.e. a wearable — hides the chip. */}
                {emoteTraits.emoteLoop !== undefined ? (
                  <S.DetailChip data-testid="detail-play-mode">
                    <Icon name={emoteTraits.emoteLoop ? 'play-loop' : 'play-once'} size={18} />
                    {emoteTraits.emoteLoop ? t('itemDetail.playLoop') : t('itemDetail.playOnce')}
                  </S.DetailChip>
                ) : null}
                {emoteTraits.emoteHasSound ? (
                  <S.DetailChip data-testid="detail-sound">
                    <Icon name="sound" size={18} />
                    {t('itemDetail.emoteSound')}
                  </S.DetailChip>
                ) : null}
                {emoteTraits.emoteHasProps ? (
                  <S.DetailChip data-testid="detail-props">
                    <Icon name="props" size={18} />
                    {t('itemDetail.emoteProps')}
                  </S.DetailChip>
                ) : null}
                {/* Blocked VRM export, with the marketplace's own wording in the tooltip. Warning-coloured,
                    unlike the neutral chips around it: this one is a restriction, not a feature. */}
                {vrmBlocked ? (
                  <Tooltip content={t('itemDetail.exportBlockedTooltip')}>
                    <S.DetailChip
                      data-variant="blocked"
                      data-testid="detail-export-blocked"
                      tabIndex={0}
                      aria-label={t('itemDetail.exportBlockedTooltip')}
                    >
                      <Icon name="ban" size={16} />
                      {t('itemDetail.exportBlocked')}
                    </S.DetailChip>
                  </Tooltip>
                ) : null}
                {utility ? (
                  <S.DetailChip data-testid="detail-utility-chip">
                    <Icon name="utility" size={18} />
                    {t('itemDetail.utility')}
                  </S.DetailChip>
                ) : null}
              </S.Chips>

              {description || utility ? (
                <S.DescRow>
                  {description ? (
                    <S.DescCol>
                      <S.Description>
                        <S.Label>{t('itemDetail.description')}</S.Label>
                        <S.DescText data-expanded={descExpanded || undefined}>{description}</S.DescText>
                        {description.length > 140 ? (
                          <S.DescToggle className="link" onClick={() => setDescExpanded(v => !v)}>
                            {descExpanded ? t('itemDetail.showLess') : t('itemDetail.readMore')}
                          </S.DescToggle>
                        ) : null}
                      </S.Description>
                    </S.DescCol>
                  ) : null}
                  {/* What the item unlocks, in the creator's own words. Reuses the description's type so the
                      two columns read as a pair, and gets no read-more: utility copy is a line or two. */}
                  {utility ? (
                    <S.DescCol>
                      <S.Description data-testid="detail-utility">
                        <S.Label>{t('itemDetail.utility')}</S.Label>
                        <S.DescText data-expanded>{utility}</S.DescText>
                      </S.Description>
                    </S.DescCol>
                  ) : null}
                </S.DescRow>
              ) : null}

              {current.creator || collection?.name || creatorPending || collectionPending ? (
                <S.Meta>
                  {current.creator ? (
                    <S.MetaCol>
                      <S.Label>{t('itemDetail.creator')}</S.Label>
                      <S.DetailCreator address={current.creator} linkToProfile hidePrefix />
                    </S.MetaCol>
                  ) : creatorPending ? (
                    <S.MetaCol>
                      <S.Label>{t('itemDetail.creator')}</S.Label>
                      <S.SkBadge aria-hidden data-testid="creator-loading">
                        <S.SkAva />
                        <S.SkName />
                      </S.SkBadge>
                    </S.MetaCol>
                  ) : null}
                  {collection?.name ? (
                    <S.MetaCol data-collection>
                      <S.Label>{t('itemDetail.collection')}</S.Label>
                      <S.DetailCollection
                        contractAddress={current.contractAddress}
                        name={collection.name}
                        items={siblings}
                      />
                    </S.MetaCol>
                  ) : collectionPending ? (
                    <S.MetaCol data-collection>
                      <S.Label>{t('itemDetail.collection')}</S.Label>
                      <S.SkBadge aria-hidden data-testid="collection-loading">
                        <S.SkAva />
                        <S.SkName />
                      </S.SkBadge>
                    </S.MetaCol>
                  ) : null}
                </S.Meta>
              ) : null}

              <S.Divider />

              {saleSectionLoading ? (
                // The sale/ownership/price state isn't decided yet — show a skeleton (price line + two
                // full-width CTA placeholders) instead of the data-dependent branch tree. Rendering the
                // "not for sale / notify" fallback here would conflate loading with "no data".
                <S.SaleSkeleton aria-hidden data-testid="sale-loading">
                  <S.SkPrice />
                  <S.SkCta />
                  <S.SkCta />
                </S.SaleSkeleton>
              ) : (
                <>
                  {/* Primary-sale banner (Figma 1524-297513): buying a fresh mint straight from the creator.
                      Only for a primary (mint) listing that's actually on sale.
                      Also only while SECONDARY sales exist. The banner's whole job is to distinguish this
                      listing from a resale, and with resales off there is nothing to distinguish it from —
                      every listing in the Shop is a mint from its creator, so the row says something that is
                      true of the entire catalogue and reads as noise. It comes back with the flag. */}
                  {secondarySales && !manage && !isMarket && forSale && !current.tokenId ? (
                    <S.PrimarySaleBanner data-testid="buy-from-creator">
                      <S.FromCreator>
                        <S.FromCreatorIco name="buy-from-creator" />
                        {t('itemDetail.buyFromCreator')}
                      </S.FromCreator>
                      <S.BannerCheck name="check-rounded" />
                    </S.PrimarySaleBanner>
                  ) : null}

                  {soldOutWithResale ? (
                    // Sold-out primary with resellers (Figma 1524-298906): original (struck) price + SOLD OUT,
                    // then the cheapest resale price + how many copies are on the secondary market.
                    <S.SoldOutPricing data-testid="sold-out">
                      <S.SoRow data-variant="original">
                        <S.SoLabel>
                          {t('itemDetail.originalPrice')}
                          <S.SoPrice>
                            <CurrencyIcon className="ico" />
                            <S.SoValue>{current.priceCredits}</S.SoValue>
                          </S.SoPrice>
                          <S.SoInfo aria-hidden>
                            <Icon name="info" size={12} />
                          </S.SoInfo>
                        </S.SoLabel>
                        <S.SoTag data-testid="out-of-stock">{t('itemDetail.soldOut')}</S.SoTag>
                      </S.SoRow>
                      <S.SoRow data-variant="resale">
                        <S.SoLabel>
                          {t('itemDetail.resalePrice')}
                          <S.SoPrice>
                            <CurrencyIcon className="ico" />
                            <S.SoValue>{lowestResale}</S.SoValue>
                          </S.SoPrice>
                          <S.SoInfo aria-hidden>
                            <Icon name="info" size={12} />
                          </S.SoInfo>
                        </S.SoLabel>
                        <S.SoStock>
                          {t('itemDetail.stock')} {resales.length}/{Rarity.getMaxSupply(rarity).toLocaleString()}
                        </S.SoStock>
                      </S.SoRow>
                    </S.SoldOutPricing>
                  ) : (
                    <S.PriceBlock>
                      <S.PriceRow>
                        <S.PriceCol>
                          {isMarket || forSale ? <S.PriceLabel>{t('itemDetail.price')}</S.PriceLabel> : null}
                          {isMarket ? (
                            <>
                              <S.Price data-variant="market" data-testid="item-price">
                                {marketPriceCredits == null ? (
                                  <S.PriceValue>—</S.PriceValue>
                                ) : (
                                  <>
                                    <S.Approx aria-hidden>≈</S.Approx>
                                    <S.Diamond />
                                    <S.PriceValue>{marketPriceCredits}</S.PriceValue>
                                  </>
                                )}
                              </S.Price>
                              <S.MarketNote>{t('assetCard.marketPrice')}</S.MarketNote>
                            </>
                          ) : forSale ? (
                            onSale ? (
                              <S.Price data-variant="sale" data-testid="item-price">
                                <S.Price>
                                  <S.Diamond />
                                  <S.PriceValue>{current.priceCredits}</S.PriceValue>
                                </S.Price>
                                <S.PriceWas>
                                  <S.Diamond data-was />
                                  {current.compareAtCredits}
                                </S.PriceWas>
                                {saleDiscountPct(current.compareAtCredits!, current.priceCredits) > 0 ? (
                                  <S.SaleBadge>
                                    {t('assetCard.saleWithDiscount', {
                                      pct: saleDiscountPct(current.compareAtCredits!, current.priceCredits)
                                    })}
                                  </S.SaleBadge>
                                ) : null}
                                <S.Countdown endsAt={current.saleEndsAt} />
                              </S.Price>
                            ) : (
                              <S.Price data-testid="item-price">
                                <S.Diamond />
                                <S.PriceValue>{current.priceCredits}</S.PriceValue>
                              </S.Price>
                            )
                          ) : manageListed && managePriceCredits ? (
                            // Owner viewing their own listed item: show the price from the fresh manage state
                            // instead of "Not for sale" while the public feed catches up to the MV refresh.
                            <S.Price data-testid="item-price">
                              <S.Diamond />
                              <S.PriceValue>{managePriceCredits}</S.PriceValue>
                            </S.Price>
                          ) : /* Owner/creator viewing their own UNLISTED asset: the manage CTAs below (Put up
                          for sale / Transfer) already convey the state, so the redundant "Not for sale" label
                          is hidden here. It stays for the NON-owner public view, where it is the only signal
                          the asset cannot be bought. */
                          manage ? null : (
                            <S.Price data-variant="none" data-testid="item-price">
                              <span>{t('itemDetail.notForSale')}</span>
                              <Tooltip content={t('itemDetail.notForSaleHint')}>
                                <S.PriceInfo tabIndex={0} role="img" aria-label={t('itemDetail.notForSaleHint')}>
                                  <Icon name="info" size={14} />
                                </S.PriceInfo>
                              </Tooltip>
                            </S.Price>
                          )}
                        </S.PriceCol>
                        {showStock ? (
                          <S.StockCol>
                            <S.PriceLabel>{t('itemDetail.stock')}</S.PriceLabel>
                            <S.StockValue>
                              {(current.available ?? 0).toLocaleString()}/{Rarity.getMaxSupply(rarity).toLocaleString()}
                            </S.StockValue>
                          </S.StockCol>
                        ) : outOfStock ? (
                          <S.StockCol>
                            <S.StockValue data-out data-testid="out-of-stock">
                              {t('itemDetail.outOfStock')}
                            </S.StockValue>
                          </S.StockCol>
                        ) : null}
                      </S.PriceRow>
                    </S.PriceBlock>
                  )}

                  <S.Ctas data-buttons={hasActionableCta || undefined} data-dual={dualCta || undefined}>
                    {isMarket ? (
                      // Market (legacy/MANA) item: a single Buy now that opens the MANA→credits checkout
                      // (MarketCheckout) — never Add to cart / BuyModal.
                      <S.DetailCta variant="purple" onClick={handleBuyNow} disabled={!canBuyMarket}>
                        <span>{t('assetCard.buyNow')}</span>
                        {marketPriceCredits != null ? (
                          <S.CtaPrice aria-hidden>
                            <S.CtaDiamond />
                            {marketPriceCredits}
                          </S.CtaPrice>
                        ) : null}
                      </S.DetailCta>
                    ) : manage ? (
                      <S.ManageActions data-testid="manage-actions">
                        <ErrorNotice message={manageError} />
                        {/* The relay could not confirm it. Deliberately NOT an error: the transaction may
                            still land, so the seller gets the two honest options instead of a "try again"
                            that has them re-signing something already in flight. */}
                        {gaslessCancelFailed && !canPayGas ? (
                          <S.GaslessNotice data-testid="cancel-gasless-failed">
                            <p>{t('itemDetail.cancelRelayRetry')}</p>
                          </S.GaslessNotice>
                        ) : null}
                        {gaslessCancelFailed && canPayGas ? (
                          <S.GaslessNotice data-testid="cancel-gasless-failed">
                            <p>
                              {gaslessCancelFailed === 'reverted'
                                ? t('itemDetail.cancelRelayReverted')
                                : t('itemDetail.cancelRelayFailed')}
                            </p>
                            <S.GaslessActions>
                              <S.LinkCta
                                type="button"
                                data-testid="cancel-pay-gas"
                                onClick={() => void takeDown({ payGas: true })}
                                disabled={managing !== null}
                              >
                                {t('itemDetail.cancelPayGas')}
                              </S.LinkCta>
                              <S.LinkCta
                                type="button"
                                data-testid="cancel-later"
                                onClick={() => setGaslessCancelFailed(null)}
                                disabled={managing !== null}
                              >
                                {t('itemDetail.cancelLater')}
                              </S.LinkCta>
                            </S.GaslessActions>
                          </S.GaslessNotice>
                        ) : null}
                        {/* A relayed cancel on a congested network takes minutes. Say so, instead of a mute
                            spinner that reads as "nothing is happening". */}
                        {managing === 'remove' && cancelSlow ? (
                          <S.GaslessNotice data-testid="cancel-slow">
                            <p>{t(canPayGas ? 'itemDetail.cancelSlow' : 'itemDetail.cancelSlowManaged')}</p>
                          </S.GaslessNotice>
                        ) : null}
                        {manageListed ? (
                          <>
                            {/* Edit price (Figma 1527-302048): dark-solid CTA with the pen glyph. Absent when
                            the viewer may not sell — re-pricing is a cancel plus a NEW listing, so it is an
                            entrance, not an exit. Remove stays below either way. */}
                            {canPutOnSale ? (
                              <S.DarkCta
                                onClick={() => void updatePrice()}
                                disabled={managing !== null || !canOpenListModal}
                              >
                                {managing !== 'update' ? <Icon name="pen" className="ico" /> : null}
                                <span>
                                  {managing === 'update'
                                    ? isManaged
                                      ? t('itemDetail.updateCanceling')
                                      : t('itemDetail.updateConfirmCancel')
                                    : t('itemDetail.manageUpdatePrice')}
                                </span>
                              </S.DarkCta>
                            ) : null}
                            <S.OutlineCta onClick={() => void takeDown()} disabled={managing !== null}>
                              <span>
                                {managing === 'remove' ? t('myAssets.removing') : t('itemDetail.manageRemove')}
                              </span>
                            </S.OutlineCta>
                          </>
                        ) : (
                          <>
                            {/* Put up for sale (Figma 1527-302810): dark-solid primary. Absent when the
                            viewer may not sell — an owned token with secondary sales off. */}
                            {canPutOnSale ? (
                              <S.DarkCta
                                onClick={() => {
                                  // Funnel-entry event for a secondary listing — this is the flow that moved off
                                  // the My Assets card (its "put on sale" fired the same event) onto the PDP.
                                  if (manageAsSecondary)
                                    track('Shop Started Listing', {
                                      listing_type: 'secondary',
                                      item_id: current.itemId ?? current.tokenId ?? null
                                    })
                                  openListModal()
                                }}
                                disabled={managing !== null || !canOpenListModal}
                              >
                                <span>{t('itemDetail.manageList')}</span>
                              </S.DarkCta>
                            ) : null}
                            {/* Transfer (Figma 1527-302810): only for a SECONDARY owned token you actually hold
                            (a primary/mint listing has no transferable token). Gasless via lib/buy. */}
                            {manageAsSecondary ? (
                              <S.OutlineCta onClick={() => setShowTransfer(true)} disabled={managing !== null}>
                                <span>{t('itemDetail.manageTransfer')}</span>
                              </S.OutlineCta>
                            ) : null}
                          </>
                        )}
                        {/* Issue copies (creator only): assign fresh mints of your own published item to
                        wallets. Shown alongside the primary CTAs whenever this item is still mintable
                        (published + remaining supply > 0 → publishableItem is present). Gasless. */}
                        {manageAsPrimary && publishableItem ? (
                          <S.LinkCta type="button" onClick={() => setShowIssue(true)} disabled={managing !== null}>
                            {t('itemDetail.manageIssue')}
                          </S.LinkCta>
                        ) : null}
                        {managing === 'update' ? (
                          // Only note kept in the manage view: explain the two-step nature while the
                          // current listing is being taken down. The "manage it in My Assets" note was
                          // removed — you're already managing right here (on both /item and /token).
                          <S.ManageNote>{t('itemDetail.updateHelper')}</S.ManageNote>
                        ) : null}
                        {lowestResale != null ? (
                          <S.ManageResellers>
                            <S.ResellersLink onClick={() => setShowResellers(true)} data-testid="view-resellers">
                              {t('itemDetail.viewAllResellers')}
                            </S.ResellersLink>
                          </S.ManageResellers>
                        ) : null}
                      </S.ManageActions>
                    ) : forSale ? (
                      <>
                        <S.DetailCta variant="purple" onClick={handleBuyNow} disabled={resolvingTrade}>
                          <span>{t('assetCard.buyNow')}</span>
                          <S.CtaPrice aria-hidden>
                            <S.CtaDiamond />
                            {current.priceCredits}
                          </S.CtaPrice>
                        </S.DetailCta>
                        <S.AddCart
                          onClick={handleAddToCart}
                          disabled={resolvingTrade || (isPrimary ? atStockCap : inCart)}
                          aria-label={addLabel}
                        >
                          <Icon name="cart" />
                          <S.AddCartLabel>{addLabel}</S.AddCartLabel>
                        </S.AddCart>
                      </>
                    ) : soldOutWithResale && cheapestResaleItem ? (
                      // Sold-out primary with resellers (Figma 1524-298906): buy the cheapest resale.
                      <>
                        <S.DetailCta
                          variant="purple"
                          onClick={() => (session ? setBuyResale(cheapestResaleItem) : signIn())}
                        >
                          <span>{t('assetCard.buyNow')}</span>
                          <S.CtaPrice aria-hidden>
                            <S.CtaDiamond />
                            {cheapestResaleItem.priceCredits}
                          </S.CtaPrice>
                        </S.DetailCta>
                        <S.AddCart
                          onClick={() => {
                            if (!resaleInCart) add(cheapestResaleItem, 'item_detail')
                          }}
                          disabled={resaleInCart}
                          aria-label={resaleInCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
                        >
                          <Icon name="cart" />
                          <S.AddCartLabel>
                            {resaleInCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
                          </S.AddCartLabel>
                        </S.AddCart>
                      </>
                    ) : (
                      // No buyable listing → hide buy/add-cart and offer "Notify me when available".
                      <>
                        <NotifyMe item={current} />
                        {/* No secondary sales for now, so there is nothing to make an offer on. */}
                        {/* <MakeOfferButton item={current} /> */}
                      </>
                    )}
                  </S.Ctas>

                  {/* Lowest resale price + the trigger for the Other Resellers modal (Figma 1524-297513).
                  Only when there's at least one resale to show, and not for your own managed item (the
                  manage view carries its own trigger below the manage CTAs). In the sold-out state the
                  resale price already shows above, so the link is centered alone (Figma 1524-298906). */}
                  {!manage && !isMarket && lowestResale != null ? (
                    <S.LowestPriceRow data-testid="lowest-price" data-centered={soldOutWithResale || undefined}>
                      {!soldOutWithResale ? (
                        <S.Lowest>
                          {t('itemDetail.lowestPrice')}
                          <CurrencyIcon className="ico" />
                          <S.LowestValue>{lowestResale}</S.LowestValue>
                        </S.Lowest>
                      ) : null}
                      <S.ResellersLink onClick={() => setShowResellers(true)} data-testid="view-resellers">
                        {t('itemDetail.viewAllResellers')}
                      </S.ResellersLink>
                    </S.LowestPriceRow>
                  ) : null}

                  {/* Gap B: the item page never manages a token. If the viewer owns copies, point them to
                  My Assets to manage/resell them instead of showing Edit/Remove here. */}
                  {!manage && !isMarket && ownedItemCount > 0 ? (
                    <S.OwnNote data-testid="you-own-note">
                      {t('itemDetail.youOwnN', { count: ownedItemCount })}{' '}
                      <Link to="/my-items">{t('nav.myAssets')}</Link>
                      {/* TODO: deep-link to My Assets filtered by this collection once that filter exists. */}
                    </S.OwnNote>
                  ) : null}
                </>
              )}
            </>
          )}
        </S.Info>
      </S.Main>

      {/* CollectionCarousel renders nothing when its items are empty, so no bare heading can appear. */}
      <CollectionCarousel
        title={carouselTitle}
        items={carouselItems}
        onViewAll={
          isCollectionOnly && current.contractAddress
            ? () => navigate(`/collection/${current.contractAddress}`)
            : undefined
        }
      />

      {showBuy && isMarket && marketListing && manaRate ? (
        <MarketCheckout
          listing={marketListing}
          rate={manaRate}
          onClose={() => setShowBuy(false)}
          onSold={() => setShowBuy(false)}
        />
      ) : showBuy && !isMarket ? (
        <BuyModal
          item={cartItem}
          resume={resumeBuy}
          onClose={() => {
            setShowBuy(false)
            setResumeBuy(false)
          }}
        />
      ) : null}

      {buyResale ? (
        <BuyModal
          item={buyResale}
          onClose={() => {
            setBuyResale(null)
            void refreshManage()
          }}
        />
      ) : null}

      {secondarySales && showResellers && current.itemId ? (
        <ResellersModal item={current} onClose={() => setShowResellers(false)} />
      ) : null}

      {showSell && ownedAsset && session ? (
        <SellModal
          asset={ownedAsset}
          session={session}
          creator={current.creator}
          onListed={(credits, tradeId) => {
            // Show the new price immediately on THIS page (justListedCredits), and optimistically patch every
            // cache that renders this token's sale state (PDP owned-token → no re-entry flash, My Assets grid,
            // shop-feed price map) so a fresh list / edit-price shows on-sale at the new price at once. The
            // feed's MV lags, so refreshManage's refetch alone would read back stale data — invalidation only
            // reconciles authoritatively afterwards.
            setJustListedCredits(credits)
            void refreshManage()
            patchManageCaches(
              qc,
              { address: session.address, contractAddress: current.contractAddress, tokenId: current.tokenId },
              { kind: 'listed', priceCredits: credits, tradeId }
            )
          }}
          onClose={closeManageModal}
        />
      ) : null}
      {showTransfer && session && current.tokenId ? (
        <TransferModal
          item={{
            contractAddress: current.contractAddress,
            chainId: current.chainId,
            tokenId: current.tokenId,
            name: current.name,
            thumbnail: current.thumbnail
          }}
          session={session}
          onClose={() => {
            setShowTransfer(false)
            void refreshManage()
          }}
          onTransferred={() => {
            // The token just left this wallet: reconcile authoritatively (refreshManage) AND optimistically
            // drop it from every cache that still renders it as owned — the My Assets grid row, the PDP's
            // owned-token detail (nulled → the manage view collapses to the public/buy view), and any
            // secondary sale entry. Without this the token lingers as owned (Edit/Remove/Transfer stay) until
            // the eventually-consistent feed catches up on the next focus/remount.
            setJustListedCredits(null)
            void refreshManage()
            patchManageCaches(
              qc,
              { address: session.address, contractAddress: current.contractAddress, tokenId: current.tokenId },
              { kind: 'gone' }
            )
          }}
        />
      ) : null}
      {showPrimary && publishableItem && session ? (
        <PrimaryListModal
          item={publishableItem}
          session={session}
          onListed={credits => setJustListedCredits(credits)}
          onClose={closeManageModal}
        />
      ) : null}
      {showIssue && publishableItem && session ? (
        <IssueModal
          item={{
            contractAddress: publishableItem.contractAddress,
            chainId: config.chainId,
            itemId: publishableItem.blockchainItemId,
            name: publishableItem.name,
            thumbnail: publishableItem.thumbnail,
            available: publishableItem.remainingSupply
          }}
          session={session}
          onClose={() => {
            setShowIssue(false)
            void refreshManage()
          }}
        />
      ) : null}
      {showVideo && showcaseVideo ? (
        <VideoShowcaseModal src={showcaseVideo} itemName={current.name} onClose={() => setShowVideo(false)} />
      ) : null}
    </S.Detail>
  )
}

// Content-shaped placeholder for the info column while a deep-linked/refreshed item resolves (replaces
// the old bare "Loading…" title). Purely decorative → aria-hidden; the preview carries the aria-busy.
function ItemInfoSkeleton() {
  return (
    <S.InfoSkel aria-hidden>
      <S.SkelTitle className="skeleton" />
      <S.SkelChips>
        <S.SkelChip className="skeleton" />
        <S.SkelChip className="skeleton" />
        <S.SkelChip className="skeleton" />
      </S.SkelChips>
      {/* The SAME grids the loaded page uses (DescRow / Meta), not a stack of equal bars: reusing them is
          what keeps the four labels on the same two columns before and after the data lands, so nothing
          slides sideways. The old skeleton was a flat list of full-width lines and described a one-column
          page that no longer exists. */}
      <S.DescRow>
        {[0, 1].map(i => (
          <S.DescCol key={i}>
            {/* Description, the real one, so the label-to-copy gap is the same 11px before and after. */}
            <S.Description>
              <S.SkelLabel className="skeleton" />
              <S.SkelText>
                <S.SkelLine className="skeleton" />
                <S.SkelLine className="skeleton" />
                <S.SkelLine className="skeleton" data-short />
              </S.SkelText>
            </S.Description>
          </S.DescCol>
        ))}
      </S.DescRow>
      <S.Meta>
        {[0, 1].map(i => (
          <S.MetaCol key={i} {...(i === 1 ? { 'data-collection': true } : {})}>
            <S.SkelLabel className="skeleton" />
            <S.SkelBadge />
          </S.MetaCol>
        ))}
      </S.Meta>
      <S.Divider />
      <S.SkelPrice className="skeleton" />
      <S.SkelBtn className="skeleton" />
    </S.InfoSkel>
  )
}

export default ItemDetail
