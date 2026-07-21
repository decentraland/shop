import { useEffect, useRef } from 'react'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import { useHoverPreview } from '~/store/hoverPreview'
import { useWallet } from '~/store/wallet'
import { isOwnListing } from '~/lib/ownership'
import { rarityInk, rarityTint, rarityDescription } from '~/lib/rarity'
import { categoryIcon, genderIcon } from '~/lib/itemIcons'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { Icon } from '~/components/Icon'
import { saleDiscountPct } from '~/lib/sale'
import { formatCredits, formatCreditsFull } from '~/lib/currency'
import { t } from '~/intl/i18n'
import { useSaleActive } from '~/hooks/useSaleActive'
import type { CatalogItem } from '~/lib/api'
import * as S from './AssetCard.styles'

const HOVER_DELAY_MS = 120

// Card variants:
// - default (native, USD-pegged): fixed credit price + Add to cart.
// - 'market' (legacy, MANA-priced): the credit price FLUCTUATES with the market rate, so it renders
//   an "≈" indicative price + a "Market price" chip and swaps Add-to-cart for Buy now (direct
//   checkout — legacy items are never added to the Zustand cart). `marketPriceCredits` is the
//   converted (rounded-up) price and `onBuyNow` opens the Buy Now checkout.
type AssetCardProps =
  | { item: CatalogItem; mode?: 'shop' }
  | { item: CatalogItem; mode: 'market'; marketPriceCredits: number | null; onBuyNow: (item: CatalogItem) => void }

export function AssetCard(props: AssetCardProps) {
  const { item } = props
  const isMarket = props.mode === 'market'
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const mediaRef = useRef<HTMLDivElement>(null)

  const add = useCart(s => s.add)
  const inCart = useCart(s => s.items.some(i => i.id === item.id))
  const address = useWallet(s => s.session?.address)
  // Your own (primary) listing — can't add it to the cart (see lib/ownership.ts).
  const own = isOwnListing(item, address)
  const toggleFav = useFavorites(s => s.toggle)
  const faved = useFavorites(s => !!s.items[item.id])
  // The single shared 3D preview (see HoverPreviewLayer): on hover this card asks it to load this item
  // and overlay this card's media. `isPreviewing`/`previewReady` reflect whether THIS card is the one
  // currently driving that shared instance.
  const showPreview = useHoverPreview(s => s.show)
  const hidePreview = useHoverPreview(s => s.hide)
  const isPreviewing = useHoverPreview(s => s.item?.id === item.id)
  const previewReady = useHoverPreview(s => (s.item?.id === item.id ? s.ready : false))

  const canPreview = !!item.contractAddress && !!item.itemId
  // Secondary listings carry tokenId; catalog items carry itemId — use whichever is present so the
  // /item/:contractAddress/:tokenId route segment is always populated.
  const routeSeg = item.tokenId ?? item.itemId
  // The whole card opens the item-detail page — market (legacy) cards included: they carry a valid
  // contractAddress + tokenId/itemId, and the detail page renders them in "market mode" (live-rate
  // price + Buy now) from the router state handed over on the link below.
  const canOpen = !!item.contractAddress && !!routeSeg
  const detailPath = `/item/${item.contractAddress}/${routeSeg}`

  function onEnter() {
    // Touch devices synthesize a `mouseenter` on tap — don't enter the hover state there (it would
    // flash the red border + 3D preview on a tap). Hover is desktop-only; see @media (hover: hover)
    // in index.css, which gates the matching CSS swap.
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(hover: hover)').matches) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (canPreview && mediaRef.current) showPreview(item, mediaRef.current)
    }, HOVER_DELAY_MS)
  }
  function onLeave() {
    if (timer.current) clearTimeout(timer.current)
    // Only release the shared preview if WE'RE the ones holding it (avoid stealing it from a card the
    // mouse has already moved onto).
    if (useHoverPreview.getState().item?.id === item.id) hidePreview()
  }

  // Release the shared preview if this card unmounts WHILE it's the active one (a filter change or
  // navigation removes the card without firing onLeave) — otherwise the store keeps a stale item +
  // detached anchor node alive and the layer's scroll/resize listeners keep measuring it.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (useHoverPreview.getState().item?.id === item.id) hidePreview()
    }
  }, [item.id, hidePreview])

  const catIco = categoryIcon(item)
  const genderIco = genderIcon(item.gender)

  // Flash sale only applies to native (fixed-price) listings — a market card's credit price
  // fluctuates, so a strike-through compare-at would be meaningless there.
  const saleActive = useSaleActive({
    priceCredits: item.priceCredits,
    compareAtCredits: item.compareAtCredits,
    saleEndsAt: item.saleEndsAt
  })
  const onSale = !isMarket && saleActive
  const discountPct = onSale ? saleDiscountPct(item.compareAtCredits!, item.priceCredits) : 0

  return (
    <S.Card
      data-testid="card"
      style={canOpen ? { cursor: 'pointer' } : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/* Whole-card navigation as a SINGLE overlaid link (keyboard + screen-reader reachable), instead
          of an interactive <article role="link"> that wraps the fav/cart/creator buttons — nesting
          interactive controls inside a link is invalid and breaks SR/tab order. The overlay sits below
          those controls via z-index so they stay independently operable. */}
      {canOpen ? (
        <S.CardLink
          data-testid="card-link"
          to={detailPath}
          // Market cards open the detail page in "market mode": hand it the live-rate credit price and
          // the market item (a UnifiedListing carrying manaWei) so it renders the ≈ price + Buy now
          // without a refetch. Native cards pass their tradeId (the detail page resolves the fixed price).
          state={
            props.mode === 'market'
              ? { item, market: true, marketPriceCredits: props.marketPriceCredits }
              : { item, tradeId: item.tradeId }
          }
          aria-label={item.name}
        />
      ) : null}
      {/* The fav button is a SIBLING of the whole-card link (not nested in the media): the media is its
          own stacking context (isolation: isolate), which would trap the button below the overlay link
          and make the heart navigate instead of toggle. As a direct child of the card its z-index sits
          above the link. */}
      <S.Fav
        data-on={faved || undefined}
        data-testid="card-fav"
        onClick={e => {
          e.stopPropagation()
          toggleFav(item)
        }}
        aria-label={faved ? t('assetCard.removeFromFavorites') : t('assetCard.addToFavorites')}
      >
        <Icon name={faved ? 'heart-solid' : 'heart'} size={18} />
      </S.Fav>
      {/* The shared 3D preview (HoverPreviewLayer) overlays this element on hover; mediaRef gives it the
          rect to position over. The card does NOT mount its own WearablePreview — it just asks the store
          to point the one warm iframe here, and the thumbnail crossfades out once that preview is ready. */}
      <S.Media ref={mediaRef} data-testid="card-media">
        {onSale ? (
          <S.SaleBadge data-testid="card-sale-badge">
            {discountPct > 0 ? t('assetCard.saleWithDiscount', { pct: discountPct }) : t('assetCard.sale')}
          </S.SaleBadge>
        ) : null}
        {item.thumbnail ? (
          <S.Img
            data-hidden={(isPreviewing && previewReady) || undefined}
            src={item.thumbnail}
            alt={item.name}
            loading="lazy"
          />
        ) : null}
      </S.Media>

      <S.Body>
        {/* Title+author on one row with the price to their right (Figma). Desc holds the flexible column
            (min-width:0 so a long name ellipses instead of shoving the price out); the price never shrinks. */}
        <S.Top>
          <S.Desc>
            <S.Name title={item.name}>{item.name}</S.Name>
            {item.creator ? (
              <S.Creator address={item.creator} linkToProfile />
            ) : (
              <S.CreatorEmpty>&nbsp;</S.CreatorEmpty>
            )}
          </S.Desc>
          {isMarket && props.mode === 'market' ? (
            <S.Price data-variant="market" data-testid="card-price-market">
              <S.Approx aria-hidden>≈</S.Approx>
              <CurrencyIcon size={15} />
              {props.marketPriceCredits == null ? '—' : formatCredits(props.marketPriceCredits)}
            </S.Price>
          ) : onSale ? (
            <S.Price data-variant="sale">
              <S.PriceNow data-testid="card-price-now" title={formatCreditsFull(item.priceCredits)}>
                <CurrencyIcon size={15} />
                {formatCredits(item.priceCredits)}
              </S.PriceNow>
              <S.PriceWas data-testid="card-price-was" title={formatCreditsFull(item.compareAtCredits!)}>
                <CurrencyIcon size={13} />
                {formatCredits(item.compareAtCredits!)}
              </S.PriceWas>
              <S.Countdown endsAt={item.saleEndsAt} testId="card-countdown" />
            </S.Price>
          ) : (
            <S.Price title={formatCreditsFull(item.priceCredits)}>
              <CurrencyIcon size={15} />
              {formatCredits(item.priceCredits)}
            </S.Price>
          )}
        </S.Top>

        {/* Chips row and the primary action share one fixed-height slot so the card doesn't change size
            when the action is revealed on hover/focus — the button replaces the chips in place. Chips
            show at rest; on hover-capable devices the action reveals on hover or keyboard focus, and it's
            always shown where hover isn't available (touch). Both stay in the DOM so the action is
            keyboard-reachable and touch-tappable. Native cards add to cart; market cards Buy now. */}
        <S.Action>
          <S.Chips data-chips>
            {/* Market (legacy) tag lives in the chips row (not the price row) so it's swapped out for the
                action button on hover like every other chip, never distorting the price / Buy now button. */}
            {isMarket ? (
              <span className="chip chip--market" data-testid="chip-market">
                {t('assetCard.marketPrice')}
              </span>
            ) : null}
            <span
              className="chip chip--rarity"
              style={{ background: rarityTint(item.rarity), color: rarityInk(item.rarity) }}
              title={rarityDescription(item.rarity)}
            >
              {item.rarity}
            </span>
            {item.isSmart ? (
              <span className="chip chip--smart" data-testid="chip-smart">
                <Icon name="smart" size={13} />
                {t('assetCard.smart')}
              </span>
            ) : null}
            {catIco ? (
              <span className="chip chip--icon">
                <Icon name={catIco} />
              </span>
            ) : null}
            {genderIco ? (
              <span className="chip chip--icon">
                <Icon name={genderIco} />
              </span>
            ) : null}
          </S.Chips>

          {/* Round add button — the compact mobile card's primary action (Figma). Same behavior as the
            full-width Cart below; only one is visible per breakpoint. */}
          {isMarket && props.mode === 'market' ? (
            <S.AddRound
              onClick={e => {
                e.stopPropagation()
                props.onBuyNow(item)
              }}
              disabled={props.marketPriceCredits == null}
              aria-label={props.marketPriceCredits == null ? t('assetCard.unavailable') : t('assetCard.buyNow')}
            >
              <Icon name="plus" size={18} />
            </S.AddRound>
          ) : (
            <S.AddRound
              onClick={e => {
                e.stopPropagation()
                if (!own) add(item, 'grid')
              }}
              disabled={inCart || own}
              aria-label={own ? t('assetCard.yourItem') : inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
            >
              <Icon name="plus" size={18} />
            </S.AddRound>
          )}

          {isMarket && props.mode === 'market' ? (
            <S.Cart
              data-testid="card-cart"
              onClick={e => {
                e.stopPropagation()
                props.onBuyNow(item)
              }}
              disabled={props.marketPriceCredits == null}
            >
              {props.marketPriceCredits == null ? t('assetCard.unavailable') : t('assetCard.buyNow')}
            </S.Cart>
          ) : (
            <S.Cart
              data-in={inCart || undefined}
              data-testid="card-cart"
              onClick={e => {
                e.stopPropagation()
                if (!own) add(item, 'grid')
              }}
              disabled={inCart || own}
            >
              {own ? null : <Icon name="cart-solid" />}
              {own ? t('assetCard.yourItem') : inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
            </S.Cart>
          )}
        </S.Action>
      </S.Body>
    </S.Card>
  )
}
