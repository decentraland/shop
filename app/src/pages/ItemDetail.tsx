import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Rarity } from '@dcl/schemas'
import { config } from '~/config'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import { useWallet } from '~/store/wallet'
import { stashResumeIntent, takeResumeIntent } from '~/lib/auth-return'
import {
  fetchShopListingForItem,
  fetchTradeForItem,
  fetchItemResales,
  fetchItemDescription,
  fetchOwnedToken,
  fetchOwnedItemCount,
  fetchTokenById,
  fetchTrade,
  type CatalogItem,
  type LegacyListing,
  type UnifiedListing
} from '~/lib/api'
import { itemIdFromTokenId } from '~/lib/token-id'
import { patchManageCaches } from '~/lib/manage-cache'
import { isSaleSectionLoading } from '~/lib/pdp-loading'
import { cancelListing } from '~/lib/buy'
import { fetchPublishableItems, type PublishableItem } from '~/lib/builder'
import { BuyModal } from '~/components/BuyModal'
import { SellModal } from '~/components/SellModal'
import { TransferModal } from '~/components/TransferModal'
import { PrimaryListModal } from '~/components/PrimaryListModal'
import { IssueModal } from '~/components/IssueModal'
import { MarketCheckout } from '~/components/MarketCheckout'
import { toast } from '~/store/toast'
import { captureError } from '~/lib/monitoring'
import { isRejection } from '~/lib/errors'
import { isManagedWallet } from '~/lib/wallet'
import { useManaRate } from '~/hooks/useManaRate'
import { useSeo } from '~/hooks/useSeo'
import { shortAddress } from '~/lib/address'
import { t } from '~/intl/i18n'
import { fetchCollectionItems, fetchCollection } from '~/lib/collections'
import { ItemPreview } from '~/components/ItemPreview'
import { CollectionCarousel } from '~/components/CollectionCarousel'
import { ResellersModal } from '~/components/ResellersModal'
import { useSecondarySales } from '~/hooks/useSecondarySales'
import { NotifyMe } from '~/components/NotifyMe'
import { MakeOfferButton } from '~/components/MakeOfferButton'
import { Tooltip } from '~/components/Tooltip'
import { ErrorNotice } from '~/components/ErrorNotice'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { rarityTint, rarityInk, rarityDescription } from '~/lib/rarity'
import { categoryIcon, genderIcon } from '~/lib/itemIcons'
import { saleDiscountPct } from '~/lib/sale'
import { useSaleActive } from '~/hooks/useSaleActive'
import { track, itemProps } from '~/lib/analytics'
import { recordViewed } from '~/lib/recently-viewed'
import { isOwnListing } from '~/lib/ownership'
import * as S from './ItemDetail.styles'
import { theme } from '~/styles/theme'

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
  const isMarket = !!state?.market
  const marketPriceCredits = state?.marketPriceCredits ?? null

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

  // Sibling items of the same collection (the "more from this collection" carousel).
  const { data: siblings = [], isFetched: siblingsFetched } = useQuery({
    queryKey: ['collection-items', current.contractAddress],
    enabled: !!current.contractAddress,
    queryFn: () => fetchCollectionItems(current.contractAddress, { first: 20 }).then(r => r.items)
  })

  // Hydrate the generic item (name, price, tradeId, stock) from the shop feed by its ITEM id. Resolved
  // by `pageItemId` — the route itemId, or the itemId DECODED from the token on the token route. This is
  // the bug fix: the old code fed the raw route segment (a tokenId on a secondary URL) to
  // fetchShopListingForItem, which treats its 2nd arg as an itemId → the server matched nothing and
  // returned the collection's first listing (a WRONG item) on a cold load. Never pass a tokenId here.
  // Also runs when a seeded item (grid nav / sibling) is missing its stock (`available`) so the
  // authoritative listing can backfill it. Never for a market/legacy item (not in this feed).
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
    queryFn: () => fetchShopListingForItem(current.contractAddress, pageItemId as string)
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
  useEffect(() => {
    if (isTokenRoute || current.name || deepLinkItem || siblings.length === 0) return
    const match =
      (pageItemId && siblings.find(s => s.itemId === pageItemId)) ||
      siblings.find(s => s.contractAddress === current.contractAddress)
    if (match) setCurrent(prev => ({ ...match, tradeId: prev.tradeId ?? match.tradeId }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siblings, deepLinkItem])

  // Carousel = OTHER items from the collection: drop the currently-viewed item + dedupe.
  const carouselItems = useMemo(() => {
    const seen = new Set<string>()
    const out: CatalogItem[] = []
    for (const s of siblings) {
      if (s.id === current.id) continue
      if (current.itemId && s.itemId === current.itemId) continue
      if (current.tokenId && s.tokenId === current.tokenId) continue
      const key = `${s.contractAddress}-${s.itemId ?? s.tokenId ?? s.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
    }
    return out
  }, [siblings, current.id, current.itemId, current.tokenId])

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

  const buyableTradeId = current.tradeId ?? resolvedTradeId ?? undefined
  const forSale = !!buyableTradeId

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
  const { data: manaRate } = useManaRate(isMarket)
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
  const faved = useFavorites(s => !!s.items[current.id])

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
  const collectionTitle = t('itemDetail.moreFromCollection')

  // Your own (primary) listing — you can't buy it (see lib/ownership.ts). Secondary self-listings are
  // caught authoritatively at buy time by isOwnTrade.
  const own = isOwnListing(current, session?.address)

  // ---- Owner / creator management -----------------------------------------------------------------
  // Two roles manage this item instead of buying it:
  //  • CREATOR of a PRIMARY (mint) listing they published — `own` (isOwnListing) already flags it.
  //  • OWNER of a SECONDARY token they hold — resolved by querying the connected wallet's holding of
  //    this exact token (also reports whether it's listed + the trade id to take it down).
  const qc = useQueryClient()
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
  // May this viewer put the asset up for sale? A creator's mint listing is PRIMARY and always allowed; an
  // owned token is a SECONDARY sale and so is gone while the flag is off. Taking an existing listing DOWN
  // stays available either way (the listed branch) — hiding the entrance must not trap the people already
  // inside. With no listing and no permission the owner simply keeps Transfer.
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
  async function takeDown(opts: { silent?: boolean; own?: boolean } = {}): Promise<boolean> {
    const own = opts.own !== false
    if (!session || !manageTradeId) return false
    setManageError(null)
    if (own) setManaging('remove')
    try {
      const trade = await fetchTrade(manageTradeId)
      await cancelListing({ trade, signer: session.signer })
      if (!opts.silent) toast.success(t('myAssets.removedFromSale', { name: current.name }))
      // Optimistically flip this token to NOT-for-sale everywhere it's rendered (PDP owned-token, the My
      // Assets grid, the shop-feed price map) the instant the cancel confirms — the feed's MV lags, so an
      // invalidate→refetch alone would read back the STALE still-listed price (previously it only
      // corrected on the next window focus). Runs for the silent edit-price cancel too, so the old listing
      // disappears immediately before the relist modal reopens. refreshManage then reconciles.
      setJustListedCredits(null)
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
      setManageError(rejected ? t('getCredits.errorCanceled') : t('myAssets.removeListingError'))
      return false
    } finally {
      if (own) setManaging(null)
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
  // The CTA block renders action buttons for a market item too (single Buy now), or for any listing
  // you don't manage (the owner/creator management actions replace them when you own/created it).
  const showCtaButtons = isMarket || !manage

  // Nothing hydrated the item (bad/stale deep link, or an item that isn't in the shop feed — e.g. a
  // legacy/market piece). Once every resolution path has settled and there's still no name, show a
  // graceful not-found instead of a permanent "Loading…" blank.
  // Also wait on the owned-token lookup while it's still resolving and nothing else has hydrated the
  // item yet — otherwise a secondary deep-link would flash Not Found before ownership backfills it.
  // A source that has RESOLVED but whose data hasn't landed in `current` yet. Every hydration path here
  // applies its result in an effect, so there is always one render where the query reports "fetched" and
  // the name is still blank — long enough to paint Not Found over a perfectly good item. Loading flags
  // alone cannot close that window; the presence of unapplied data can.
  const hydrationPending = !current.name && (!!deepLinkItem || !!ownedAsset || !!publicToken)
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
      priceKnown: current.priceCredits > 0 || manage,
      manage,
      soldOutWithResale,
      stillResolving,
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
      <S.Detail data-notfound>
        <S.NotFoundIco name="cart" />
        <S.NotFoundTitle>{t('itemDetail.notAvailableTitle')}</S.NotFoundTitle>
        <p className="muted">{t('itemDetail.notAvailableBody')}</p>
        <S.NotFoundCta variant="purple" onClick={() => navigate('/assets')}>
          {t('notFound.cta')}
        </S.NotFoundCta>
      </S.Detail>
    )
  }

  return (
    <S.Detail>
      <S.Crumbs aria-label={t('itemDetail.breadcrumbAria')}>
        <S.CrumbLink onClick={() => navigate('/assets')}>{t('nav.collectibles')}</S.CrumbLink>
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
              Shares the fav state with the title-row heart, which hides on mobile (item-detail.css) so
              only one is ever in the a11y tree. */}
          <S.Fav
            data-fav-preview
            data-on={faved || undefined}
            onClick={() => toggleFav(current)}
            aria-pressed={faved}
            aria-label={faved ? t('assetCard.removeFromFavorites') : t('assetCard.addToFavorites')}
          >
            <Icon name={faved ? 'heart-solid' : 'heart'} size={18} />
          </S.Fav>
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
                <S.Fav
                  data-fav-title
                  data-on={faved || undefined}
                  onClick={() => toggleFav(current)}
                  aria-pressed={faved}
                  aria-label={faved ? t('assetCard.removeFromFavorites') : t('assetCard.addToFavorites')}
                >
                  <Icon name={faved ? 'heart-solid' : 'heart'} size={18} />
                </S.Fav>
              </S.InfoHead>

              <S.Chips>
                <S.DetailChip
                  data-variant="rarity"
                  style={{ background: rarityTint(rarity), color: rarityInk(rarity) }}
                  title={rarityDescription(current.rarity)}
                >
                  {current.rarity}
                </S.DetailChip>
                <S.DetailChip>
                  {catIco ? <Icon name={catIco} size={18} color={theme.colors.text2} /> : null}
                  {categoryLabel(current)}
                </S.DetailChip>
                {gender ? (
                  <S.DetailChip>
                    {genderIco ? <Icon name={genderIco} size={18} color={theme.colors.text2} /> : null}
                    {gender}
                  </S.DetailChip>
                ) : null}
                {/* Which specific copy this is (the mint index). Only shown when the title itself
                    doesn't already carry it: on the /token route the heading is "Name #N", so the
                    chip would be redundant — it's kept only for the generic /item view. */}
                {!isTokenRoute && current.issuedId ? (
                  <S.DetailChip data-testid="detail-issued">#{current.issuedId}</S.DetailChip>
                ) : null}
              </S.Chips>

              {description ? (
                <S.Description>
                  <S.Label>{t('itemDetail.description')}</S.Label>
                  <S.DescText data-expanded={descExpanded || undefined}>{description}</S.DescText>
                  {description.length > 140 ? (
                    <S.DescToggle className="link" onClick={() => setDescExpanded(v => !v)}>
                      {descExpanded ? t('itemDetail.showLess') : t('itemDetail.readMore')}
                    </S.DescToggle>
                  ) : null}
                </S.Description>
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
                      Only for a primary (mint) listing that's actually on sale. */}
                  {!manage && !isMarket && forSale && !current.tokenId ? (
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
                              <S.MarketNote className="muted">{t('assetCard.marketPrice')}</S.MarketNote>
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

                  <S.Ctas data-buttons={showCtaButtons || undefined} data-dual={dualCta || undefined}>
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
                        {manageListed ? (
                          <>
                            {/* Edit price (Figma 1527-302048): dark-solid CTA with the pen glyph. */}
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
                          <S.OutlineCta onClick={() => setShowIssue(true)} disabled={managing !== null}>
                            <span>{t('itemDetail.manageIssue')}</span>
                          </S.OutlineCta>
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
                          <Icon name="cart-solid" />
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
                          <Icon name="cart-solid" />
                          <S.AddCartLabel>
                            {resaleInCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
                          </S.AddCartLabel>
                        </S.AddCart>
                      </>
                    ) : (
                      // No buyable listing → hide buy/add-cart and offer "Notify me when available" + the
                      // (coming-soon) Make an offer CTA.
                      <>
                        <NotifyMe item={current} />
                        <MakeOfferButton item={current} />
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
                      <Link to="/my-assets">{t('nav.myAssets')}</Link>
                      {/* TODO: deep-link to My Assets filtered by this collection once that filter exists. */}
                    </S.OwnNote>
                  ) : null}
                </>
              )}
            </>
          )}
        </S.Info>
      </S.Main>

      <CollectionCarousel
        title={collectionTitle}
        items={carouselItems}
        onViewAll={current.contractAddress ? () => navigate(`/collection/${current.contractAddress}`) : undefined}
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
    </S.Detail>
  )
}

// Content-shaped placeholder for the info column while a deep-linked/refreshed item resolves (replaces
// the old bare "Loading…" title). Purely decorative → aria-hidden; the preview carries the aria-busy.
function ItemInfoSkeleton() {
  return (
    <S.InfoSkel aria-hidden>
      <span className="skeleton" />
      <S.SkelChips>
        <span className="skeleton" />
        <span className="skeleton" />
      </S.SkelChips>
      <span className="skeleton" />
      <span className="skeleton" data-short />
      <S.Divider />
      <span className="skeleton" />
      <span className="skeleton" />
    </S.InfoSkel>
  )
}

export default ItemDetail
