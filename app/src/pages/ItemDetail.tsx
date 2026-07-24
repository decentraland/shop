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
import { useSeo } from '~/hooks/useSeo'
import { shortAddress } from '~/lib/address'
import { t } from '~/intl/i18n'
import { fetchCollectionItems, fetchCollection } from '~/lib/collections'
import { ItemPreview } from '~/components/ItemPreview'
import { CollectionCarousel } from '~/components/CollectionCarousel'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { theme } from '~/styles/theme'
import { rarityTint, rarityInk, rarityDescription } from '~/lib/rarity'
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
  const { data: resolvedTradeId, isLoading: resolvingTrade } = useQuery({
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
  const collectionTitle = t('itemDetail.moreFromCollection')

  // Your own (primary) listing — you can't buy it (see lib/ownership.ts). Secondary self-listings are
  // caught authoritatively at buy time by isOwnTrade.
  const own = isOwnListing(current, session?.address)

  const addLabel = !forSale
    ? t('itemDetail.notForSale')
    : inCart
      ? t('assetCard.inCart')
      : resolvingTrade
        ? t('itemDetail.checking')
        : t('assetCard.addToCart')

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
  const notFound = !current.name && !stillResolving

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
      <S.NotFound>
        <S.NotFoundIco name="cart" size={44} />
        <S.NotFoundTitle>{t('itemDetail.notAvailableTitle')}</S.NotFoundTitle>
        <p className="muted">{t('itemDetail.notAvailableBody')}</p>
        <S.NotFoundCta variant="purple" onClick={() => navigate('/assets')}>
          {t('notFound.cta')}
        </S.NotFoundCta>
      </S.NotFound>
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
            <S.PreviewLoading data-preview-loading aria-busy="true" aria-label={t('itemPreview.loading')}>
              <S.PreviewSkeleton className="skeleton" aria-hidden />
            </S.PreviewLoading>
          )}
          {/* Mobile favourite heart: a circular button at the preview's top-right (Figma 1182-195410).
              Shares the fav state with the title-row heart, which hides on mobile so only one is ever
              in the a11y tree. */}
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

        <S.Info>
          {!current.name ? (
            <ItemInfoSkeleton />
          ) : (
            <>
              <S.InfoHead>
                <S.Title>{current.name}</S.Title>
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
                <S.DetailChip data-variant="cat">
                  {catIco ? <Icon name={catIco} size={18} color="var(--text-2)" /> : null}
                  {categoryLabel(current)}
                </S.DetailChip>
                {gender ? (
                  <S.DetailChip data-variant="cat">
                    {genderIco ? <Icon name={genderIco} size={18} color="var(--text-2)" /> : null}
                    {gender}
                  </S.DetailChip>
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

              {current.creator || collection?.name ? (
                <S.Meta>
                  {current.creator ? (
                    <S.MetaCol>
                      <S.Label>{t('itemDetail.creator')}</S.Label>
                      <S.DetailCreator address={current.creator} linkToProfile hidePrefix />
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
                  ) : null}
                </S.Meta>
              ) : null}

              <S.Divider />

              <S.PriceBlock>
                <S.PriceRow>
                  <S.PriceCol>
                    <S.PriceLabel>{t('itemDetail.price')}</S.PriceLabel>
                    {isMarket ? (
                      <>
                        <S.Price>
                          {marketPriceCredits == null ? (
                            <S.PriceValue>—</S.PriceValue>
                          ) : (
                            <>
                              <S.Approx aria-hidden>≈</S.Approx>
                              <CurrencyIcon size={30} color={theme.colors.brandViolet} />
                              <S.PriceValue>{marketPriceCredits}</S.PriceValue>
                            </>
                          )}
                        </S.Price>
                        <S.MarketNote className="muted">{t('assetCard.marketPrice')}</S.MarketNote>
                      </>
                    ) : forSale ? (
                      onSale ? (
                        <S.Price data-variant="sale">
                          <S.PriceInner>
                            <CurrencyIcon size={30} color={theme.colors.dclRed} />
                            <S.PriceValue>{current.priceCredits}</S.PriceValue>
                          </S.PriceInner>
                          <S.PriceWas>
                            <CurrencyIcon size={18} color={theme.colors.muted} />
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
                        <S.Price>
                          <CurrencyIcon size={30} color={theme.colors.brandViolet} />
                          <S.PriceValue>{current.priceCredits}</S.PriceValue>
                        </S.Price>
                      )
                    ) : (
                      <S.Price data-variant="none">{t('itemDetail.notForSale')}</S.Price>
                    )}
                  </S.PriceCol>
                  {showStock ? (
                    <S.StockCol>
                      <S.PriceLabel>{t('itemDetail.stock')}</S.PriceLabel>
                      <S.StockValue>
                        {(current.available ?? 0).toLocaleString()}/{Rarity.getMaxSupply(rarity).toLocaleString()}
                      </S.StockValue>
                    </S.StockCol>
                  ) : null}
                </S.PriceRow>
              </S.PriceBlock>

              <S.Ctas data-buttons={showCtaButtons || undefined} data-dual={dualCta || undefined}>
                {isMarket ? (
                  // Market (legacy/MANA) item: a single Buy now that opens the MANA→credits checkout
                  // (MarketCheckout) — never Add to cart / BuyModal.
                  <S.DetailCta variant="purple" onClick={() => setShowBuy(true)} disabled={!canBuyMarket}>
                    <span>{t('assetCard.buyNow')}</span>
                    {marketPriceCredits != null ? (
                      <S.CtaPrice aria-hidden>
                        <CurrencyIcon size={20} />
                        {marketPriceCredits}
                      </S.CtaPrice>
                    ) : null}
                  </S.DetailCta>
                ) : own ? (
                  <S.OwnNote className="muted">
                    {t('itemDetail.ownItemPrefix')} <Link to="/my-assets">{t('nav.myAssets')}</Link>
                    {t('itemDetail.ownItemSuffix')}
                  </S.OwnNote>
                ) : (
                  <>
                    {forSale ? (
                      <S.DetailCta variant="purple" onClick={() => setShowBuy(true)} disabled={resolvingTrade}>
                        <span>{t('assetCard.buyNow')}</span>
                        <S.CtaPrice aria-hidden>
                          <CurrencyIcon size={20} />
                          {current.priceCredits}
                        </S.CtaPrice>
                      </S.DetailCta>
                    ) : null}
                    <S.AddCart
                      onClick={handleAddToCart}
                      disabled={!forSale || inCart || resolvingTrade}
                      aria-label={addLabel}
                    >
                      <Icon name="cart-solid" />
                      <S.AddCartLabel>{addLabel}</S.AddCartLabel>
                    </S.AddCart>
                  </>
                )}
              </S.Ctas>
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
      </S.SkelChips>
      <S.SkelLine className="skeleton" />
      <S.SkelLine className="skeleton" data-short />
      <S.Divider />
      <S.SkelPrice className="skeleton" />
      <S.SkelBtn className="skeleton" />
    </S.InfoSkel>
  )
}

export default ItemDetail
