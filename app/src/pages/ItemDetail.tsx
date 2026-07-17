import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Rarity } from '@dcl/schemas'
import { config } from '~/config'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import { useWallet } from '~/store/wallet'
import {
  fetchShopListingForItem,
  fetchTradeForItem,
  fetchItemDescription,
  type CatalogItem,
  type LegacyListing,
  type UnifiedListing
} from '~/lib/api'
import { BuyModal } from '~/components/BuyModal'
import { MarketCheckout } from '~/components/MarketCheckout'
import { useManaRate } from '~/hooks/useManaRate'
import { fetchCollectionItems, fetchCollection } from '~/lib/collections'
import { ItemPreview } from '~/components/ItemPreview'
import { CollectionCarousel } from '~/components/CollectionCarousel'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CollectionBadge } from '~/components/CollectionBadge'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { SaleCountdown } from '~/components/SaleCountdown'
import { rarityTint, rarityInk, rarityDescription } from '~/lib/rarity'
import { categoryIcon, genderIcon } from '~/lib/itemIcons'
import { saleDiscountPct } from '~/lib/sale'
import { useSaleActive } from '~/hooks/useSaleActive'
import { track, itemProps } from '~/lib/analytics'
import { recordViewed } from '~/lib/recently-viewed'
import { isOwnListing } from '~/lib/ownership'
import './item-detail.css'

function isValidRarity(r: string): r is Rarity {
  return (Object.values(Rarity) as string[]).includes(r)
}

function genderLabel(gender: CatalogItem['gender']): string | null {
  if (gender === 'male') return 'Male'
  if (gender === 'female') return 'Female'
  if (gender === 'unisex') return 'Unisex'
  return null
}

// Human label for the category chip: the specific wearable/emote sub-category when known
// (e.g. "eyewear" → "eyewear", uppercased by CSS), else the broad Wearable/Emote.
function categoryLabel(item: CatalogItem): string {
  if (item.wearableCategory) return item.wearableCategory.replace(/_/g, ' ')
  return item.category === 'emote' ? 'Emote' : 'Wearable'
}

export function ItemDetail() {
  const { contractAddress, tokenId } = useParams<{ contractAddress: string; tokenId: string }>()
  const { state } = useLocation() as {
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
  const navigate = useNavigate()

  // Market (legacy/MANA) mode is decided entirely by the router state the grid passes — there's no
  // authoritative shop-listing to fall back to (legacy items aren't in the USD-pegged feed).
  const isMarket = !!state?.market
  const marketPriceCredits = state?.marketPriceCredits ?? null

  const add = useCart(s => s.add)
  const cartItems = useCart(s => s.items)
  const toggleFav = useFavorites(s => s.toggle)
  const { session } = useWallet()

  // The currently-displayed item. Seeded from router state (fast path from the grid); swapped in place
  // when a carousel sibling is tapped (no full reload). Falls back to a stub for deep links/refresh
  // (name/thumbnail/price then fill in from the collection fetch below).
  const [current, setCurrent] = useState<CatalogItem>(() => {
    if (state?.item) return { ...state.item, tradeId: state.tradeId ?? state.item.tradeId }
    return {
      id: `${contractAddress}-${tokenId}`,
      name: '',
      creator: '',
      contractAddress: contractAddress ?? '',
      itemId: null,
      category: 'wearable',
      rarity: 'common',
      network: 'MATIC',
      chainId: config.chainId,
      thumbnail: '',
      priceCredits: 0,
      gender: null,
      isSmart: false,
      tokenId: tokenId ?? undefined,
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

  // Sibling items of the same collection (the "more from this collection" carousel).
  const { data: siblings = [], isFetched: siblingsFetched } = useQuery({
    queryKey: ['collection-items', current.contractAddress],
    enabled: !!current.contractAddress,
    queryFn: () => fetchCollectionItems(current.contractAddress, { first: 20 }).then(r => r.items)
  })

  // Deep-link / refresh: the route segment is the itemId for primary listings. Hydrate the item
  // (name, price, tradeId) straight from the shop feed so it resolves correctly (a primary itemId is
  // NOT a tokenId — the sibling fallback below would otherwise mis-match).
  // Also runs when a PRIMARY item was seeded from router state (grid nav) or a sibling but is missing
  // its stock (`available`) — siblings/grid rows don't carry it — so the authoritative shop listing
  // can backfill it (see the effect below). Never for a market/legacy item (not in this feed).
  const needsPrimaryStock = current.available == null && !current.tokenId
  const { data: deepLinkItem, isLoading: deepLinkLoading } = useQuery({
    queryKey: ['shop-item', current.contractAddress, tokenId],
    enabled: !isMarket && !!current.contractAddress && !!tokenId && (!state?.item || needsPrimaryStock),
    queryFn: () => fetchShopListingForItem(current.contractAddress, tokenId as string)
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
  const { data: collection } = useQuery({
    queryKey: ['collection-meta', current.contractAddress],
    enabled: !!current.contractAddress,
    staleTime: 5 * 60_000,
    queryFn: () => fetchCollection(current.contractAddress)
  })

  // Fallback backfill: if still unhydrated (e.g. not currently on sale), fill from the matching
  // sibling once the collection resolves. Skip it when the authoritative shop listing (deepLinkItem)
  // is available — that carries the fields siblings lack (stock, wearableCategory) and would otherwise
  // be clobbered if both resolve in the same React batch (the guard below reads a stale `current`).
  useEffect(() => {
    if (current.name || deepLinkItem || siblings.length === 0) return
    const match =
      (tokenId && siblings.find(s => s.tokenId === tokenId || s.itemId === tokenId)) ||
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
  const {
    data: resolvedTradeId,
    isLoading: resolvingTrade
  } = useQuery({
    queryKey: ['detail-trade', current.id, current.tradeId, current.contractAddress, current.itemId],
    enabled: !!current.contractAddress,
    queryFn: async (): Promise<string | null> => {
      if (current.tradeId) return current.tradeId
      if (current.itemId) {
        const trade = await fetchTradeForItem(current.contractAddress, current.itemId)
        return trade?.id ?? null
      }
      return null
    }
  })

  const buyableTradeId = current.tradeId ?? resolvedTradeId ?? undefined
  const forSale = !!buyableTradeId

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
  const routeKey = `${contractAddress}/${tokenId}`
  const seededRoute = useRef(routeKey)
  useEffect(() => {
    if (seededRoute.current === routeKey) return
    seededRoute.current = routeKey
    if (state?.item) {
      setCurrent({ ...state.item, tradeId: state.tradeId ?? state.item.tradeId })
    }
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  function handleAddToCart() {
    if (!forSale || inCart || own) return
    add(cartItem, 'item_detail')
  }


  const rarity: Rarity = isValidRarity(current.rarity) ? current.rarity : Rarity.COMMON
  const gender = genderLabel(current.gender)
  const catIco = categoryIcon(current)
  const genderIco = genderIcon(current.gender)
  const onSale = forSale && saleActive
  const collectionTitle = 'More from this collection'

  // Your own (primary) listing — you can't buy it (see lib/ownership.ts). Secondary self-listings are
  // caught authoritatively at buy time by isOwnTrade.
  const own = isOwnListing(current, session?.address)

  const addLabel = !forSale ? 'Not for sale' : inCart ? 'In cart' : resolvingTrade ? 'Checking…' : 'Add to cart'

  // Stock (primary/mint listings only): the shop feed carries the remaining mintable supply. Secondary
  // listings (a specific token) have no stock concept, so we hide it there (see Figma 1052-151285).
  const showStock = typeof current.available === 'number' && current.available > 0 && !current.tokenId && !isMarket
  // Both action buttons present (buyable, not your own): on mobile they collapse into a sticky row of
  // a wide Buy-now + a compact cart icon (see Figma 1182-194973). A market item has only Buy now.
  const dualCta = !own && forSale && !isMarket
  // The CTA block renders action buttons for a market item too (single Buy now), or for any listing
  // that isn't your own (the "manage in My Assets" note replaces them only for your own native item).
  const showCtaButtons = isMarket || !own

  // Nothing hydrated the item (bad/stale deep link, or an item that isn't in the shop feed — e.g. a
  // legacy/market piece). Once every resolution path has settled and there's still no name, show a
  // graceful not-found instead of a permanent "Loading…" blank.
  const stillResolving = deepLinkLoading || (!!current.contractAddress && !siblingsFetched)
  if (!current.name && !stillResolving) {
    return (
      <div className="item-detail item-detail--notfound">
        <span className="ico ico-cart item-detail__notfound-ico" aria-hidden />
        <h1 className="item-detail__notfound-title">This item isn’t available</h1>
        <p className="muted">It may have been delisted or moved. Browse Collectibles for something else.</p>
        <button className="btn btn--purple" onClick={() => navigate('/assets')}>Browse Collectibles</button>
      </div>
    )
  }

  return (
    <div className="item-detail">
      <nav className="item-detail__crumbs" aria-label="Breadcrumb">
        <button className="item-detail__crumb-link" onClick={() => navigate('/assets')}>
          Collectibles
        </button>
        <span className="item-detail__crumb-sep">/</span>
        <span className="item-detail__crumb-current">{current.name || 'Item'}</span>
      </nav>

      <div className="item-detail__main">
        <div className="item-detail__preview">
          {/* Mount the preview only once the item's identity is resolved (deep-link/refresh hydrate a
              stub first) so the 3D iframe mounts ONCE with the right item — no stub→hydrated remount /
              double-load. Show the same loader meanwhile. */}
          {current.name ? (
            <ItemPreview item={current} />
          ) : (
            <div className="item-preview__loading" aria-busy="true" aria-label="Loading preview">
              <span className="skeleton item-preview__skeleton" aria-hidden />
            </div>
          )}
          {/* Mobile favourite heart: a circular button at the preview's top-right (Figma 1182-195410).
              Shares the fav state with the title-row heart, which hides on mobile (item-detail.css) so
              only one is ever in the a11y tree. */}
          <button
            className={`item-detail__fav item-detail__fav--preview${faved ? ' is-on' : ''}`}
            onClick={() => toggleFav(current)}
            aria-pressed={faved}
            aria-label={faved ? 'Remove from favorites' : 'Add to favorites'}
          >
            <span className={`ico ${faved ? 'ico-heart-solid' : 'ico-heart'}`} aria-hidden />
          </button>
        </div>

        <div className="item-detail__info">
          {!current.name ? (
            <ItemInfoSkeleton />
          ) : (
            <>
          <div className="item-detail__info-head">
            <h1 className="item-detail__title">{current.name}</h1>
            <button
              className={`item-detail__fav${faved ? ' is-on' : ''}`}
              onClick={() => toggleFav(current)}
              aria-pressed={faved}
              aria-label={faved ? 'Remove from favorites' : 'Add to favorites'}
            >
              <span className={`ico ${faved ? 'ico-heart-solid' : 'ico-heart'}`} aria-hidden />
            </button>
          </div>

          <div className="item-detail__chips">
            <span
              className="chip chip--rarity"
              style={{ background: rarityTint(rarity), color: rarityInk(rarity) }}
              title={rarityDescription(current.rarity)}
            >
              {current.rarity}
            </span>
            <span className="chip item-detail__chip">
              {catIco ? <span className={`ico ico-${catIco} item-detail__chip-ico`} aria-hidden /> : null}
              {categoryLabel(current)}
            </span>
            {gender ? (
              <span className="chip item-detail__chip">
                {genderIco ? <span className={`ico ico-${genderIco} item-detail__chip-ico`} aria-hidden /> : null}
                {gender}
              </span>
            ) : null}
          </div>

          {description ? (
            <div className="item-detail__section item-detail__description">
              <div className="item-detail__label">Description</div>
              <p className={`item-detail__desc-text${descExpanded ? ' is-expanded' : ''}`}>{description}</p>
              {description.length > 140 ? (
                <button className="link item-detail__desc-toggle" onClick={() => setDescExpanded(v => !v)}>
                  {descExpanded ? 'Show less' : 'Read more'}
                </button>
              ) : null}
            </div>
          ) : null}

          {current.creator || collection?.name ? (
            <div className="item-detail__meta">
              {current.creator ? (
                <div className="item-detail__meta-col">
                  <div className="item-detail__label">Creator</div>
                  <CreatorBadge address={current.creator} className="item-detail__creator" linkToProfile hidePrefix />
                </div>
              ) : null}
              {collection?.name ? (
                <div className="item-detail__meta-col item-detail__meta-col--collection">
                  <div className="item-detail__label">Collection</div>
                  <CollectionBadge
                    contractAddress={current.contractAddress}
                    name={collection.name}
                    items={siblings}
                    className="item-detail__creator"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <hr className="item-detail__divider" />

          <div className="item-detail__price-block">
            <div className="item-detail__price-row">
              <div className="item-detail__price-col">
                <div className="item-detail__price-label">Price</div>
                {isMarket ? (
                  <>
                    <div className="item-detail__price item-detail__price--market">
                      {marketPriceCredits == null ? (
                        <span className="item-detail__price-value">—</span>
                      ) : (
                        <>
                          <span className="item-detail__approx" aria-hidden>
                            ≈
                          </span>
                          <CurrencyIcon className="item-detail__diamond" />
                          <span className="item-detail__price-value">{marketPriceCredits}</span>
                        </>
                      )}
                    </div>
                    <div className="item-detail__market-note muted">Market price</div>
                  </>
                ) : forSale ? (
                  onSale ? (
                    <div className="item-detail__price item-detail__price--sale">
                      <span className="item-detail__price">
                        <CurrencyIcon className="item-detail__diamond" />
                        <span className="item-detail__price-value">{current.priceCredits}</span>
                      </span>
                      <span className="item-detail__price-was">
                        <CurrencyIcon className="item-detail__diamond item-detail__diamond--was" />
                        {current.compareAtCredits}
                      </span>
                      {saleDiscountPct(current.compareAtCredits!, current.priceCredits) > 0 ? (
                        <span className="item-detail__sale-badge">
                          SALE -{saleDiscountPct(current.compareAtCredits!, current.priceCredits)}%
                        </span>
                      ) : null}
                      <SaleCountdown endsAt={current.saleEndsAt} className="item-detail__countdown" />
                    </div>
                  ) : (
                    <div className="item-detail__price">
                      <CurrencyIcon className="item-detail__diamond" />
                      <span className="item-detail__price-value">{current.priceCredits}</span>
                    </div>
                  )
                ) : (
                  <div className="item-detail__price item-detail__price--none">Not for sale</div>
                )}
              </div>
              {showStock ? (
                <div className="item-detail__stock-col">
                  <div className="item-detail__price-label">Stock</div>
                  <div className="item-detail__stock-value">
                    {(current.available ?? 0).toLocaleString()}/{Rarity.getMaxSupply(rarity).toLocaleString()}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className={`item-detail__ctas${showCtaButtons ? ' item-detail__ctas--buttons' : ''}${
              dualCta ? ' item-detail__ctas--dual' : ''
            }`}
          >
            {isMarket ? (
              // Market (legacy/MANA) item: a single Buy now that opens the MANA→credits checkout
              // (MarketCheckout) — never Add to cart / BuyModal.
              <button
                className="btn btn--purple item-detail__cta"
                onClick={() => setShowBuy(true)}
                disabled={!canBuyMarket}
              >
                <span className="item-detail__cta-label">Buy now</span>
                {marketPriceCredits != null ? (
                  <span className="item-detail__cta-price" aria-hidden>
                    <CurrencyIcon className="item-detail__cta-diamond" />
                    {marketPriceCredits}
                  </span>
                ) : null}
              </button>
            ) : own ? (
              <p className="item-detail__own-note muted">
                This is your item — manage it in <Link to="/my-assets">My Assets</Link>.
              </p>
            ) : (
            <>
            {forSale ? (
              <button
                className="btn btn--purple item-detail__cta"
                onClick={() => setShowBuy(true)}
                disabled={resolvingTrade}
              >
                <span className="item-detail__cta-label">Buy now</span>
                <span className="item-detail__cta-price" aria-hidden>
                  <CurrencyIcon className="item-detail__cta-diamond" />
                  {current.priceCredits}
                </span>
              </button>
            ) : null}
            <button
              className="item-detail__addcart"
              onClick={handleAddToCart}
              disabled={!forSale || inCart || resolvingTrade}
              aria-label={addLabel}
            >
              <span className="ico ico-cart-solid item-detail__addcart-ico" aria-hidden />
              <span className="item-detail__addcart-label">{addLabel}</span>
            </button>
            </>
            )}
          </div>
            </>
          )}
        </div>
      </div>

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
    </div>
  )
}

// Content-shaped placeholder for the info column while a deep-linked/refreshed item resolves (replaces
// the old bare "Loading…" title). Purely decorative → aria-hidden; the preview carries the aria-busy.
function ItemInfoSkeleton() {
  return (
    <div className="item-detail__info-skel" aria-hidden>
      <span className="skeleton id-skel__title" />
      <div className="id-skel__chips">
        <span className="skeleton id-skel__chip" />
        <span className="skeleton id-skel__chip" />
      </div>
      <span className="skeleton id-skel__line" />
      <span className="skeleton id-skel__line id-skel__line--short" />
      <hr className="item-detail__divider" />
      <span className="skeleton id-skel__price" />
      <span className="skeleton id-skel__btn" />
    </div>
  )
}

export default ItemDetail
