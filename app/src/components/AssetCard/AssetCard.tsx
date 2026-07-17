import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import { useHoverPreview } from '~/store/hoverPreview'
import { useWallet } from '~/store/wallet'
import { isOwnListing } from '~/lib/ownership'
import { CreatorBadge } from '~/components/CreatorBadge'
import { rarityInk, rarityTint } from '~/lib/rarity'
import { categoryIcon, genderIcon } from '~/lib/itemIcons'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { SaleCountdown } from '~/components/SaleCountdown'
import { saleDiscountPct } from '~/lib/sale'
import { formatCredits, formatCreditsFull } from '~/lib/currency'
import { t } from '~/intl/i18n'
import { useSaleActive } from '~/hooks/useSaleActive'
import type { CatalogItem } from '~/lib/api'
import { WearablePreview } from '../LazyWearablePreview'
import './asset-card.css'

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
  const [hovered, setHovered] = useState(false)
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
  // Market (legacy) cards don't open the item-detail page — those listings aren't in the USD-pegged
  // shop feed the detail page reads, so Buy now is the only action. Keeps the tab self-contained.
  const canOpen = !isMarket && !!item.contractAddress && !!routeSeg
  const detailPath = `/item/${item.contractAddress}/${routeSeg}`

  function onEnter() {
    // Touch devices synthesize a `mouseenter` on tap — don't enter the hover state there (it would
    // flash the red border + 3D preview on a tap). Hover is desktop-only; see @media (hover: hover)
    // in index.css, which gates the matching CSS swap.
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(hover: hover)').matches) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setHovered(true)
      if (canPreview && mediaRef.current) showPreview(item, mediaRef.current)
    }, HOVER_DELAY_MS)
  }
  function onLeave() {
    if (timer.current) clearTimeout(timer.current)
    setHovered(false)
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
    <article
      className={`card${hovered ? ' card--hover' : ''}`}
      style={canOpen ? { cursor: 'pointer' } : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/* Whole-card navigation as a SINGLE overlaid link (keyboard + screen-reader reachable), instead
          of an interactive <article role="link"> that wraps the fav/cart/creator buttons — nesting
          interactive controls inside a link is invalid and breaks SR/tab order. The overlay sits below
          those controls via z-index (see .card__link in index.css) so they stay independently operable. */}
      {canOpen ? (
        <Link className="card__link" to={detailPath} state={{ item, tradeId: item.tradeId }} aria-label={item.name} />
      ) : null}
      {/* The fav button is a SIBLING of the whole-card link (not nested in .card__media): the media is
          its own stacking context (isolation: isolate, for the skeleton's z-index), which would trap
          the button below the z-index:3 overlay link and make the heart navigate instead of toggle.
          As a direct child of the position:relative card, its z-index:4 sits above the link. */}
      <button
        className={`card__fav${faved ? ' is-on' : ''}`}
        onClick={e => {
          e.stopPropagation()
          toggleFav(item)
        }}
        aria-label={faved ? t('assetCard.removeFromFavorites') : t('assetCard.addToFavorites')}
      >
        <span className={`ico ${faved ? 'ico-heart-solid' : 'ico-heart'}`} aria-hidden />
      </button>
      {/* The shared 3D preview (HoverPreviewLayer) overlays this element on hover; mediaRef gives it the
          rect to position over. */}
      <div className="card__media" ref={mediaRef}>
        {onSale ? (
          <span className="card__sale-badge">
            {discountPct > 0 ? t('assetCard.saleWithDiscount', { pct: discountPct }) : t('assetCard.sale')}
          </span>
        ) : null}
        {/* Flat thumbnail stays visible the whole time the 3D loads (no empty frame); it only fades out
            once the shared preview has this item's scene ready, crossfading into the 3D. */}
        {item.thumbnail ? (
          <img
            className={`card__img${isPreviewing && previewReady ? ' card__img--hidden' : ''}`}
            src={item.thumbnail}
            alt={item.name}
            loading="lazy"
          />
        ) : null}
        {hovered && canPreview ? (
          <>
            <div className={`card__preview${previewReady ? ' is-ready' : ''}`}>
              <WearablePreview
                contractAddress={item.contractAddress}
                itemId={item.itemId ?? undefined}
                profile="default"
                // Load straight into the fashion pose (like ItemPreview) so the avatar doesn't flash a
                // default arms-out T-pose for a beat before settling. Emotes play their own animation.
                type={item.category === 'emote' ? undefined : PreviewType.AVATAR}
                emote={item.category === 'emote' ? undefined : PreviewEmote.FASHION}
                disableBackground
                disableFadeEffect
              />
            </div>
            {/* Transparent shield over the preview: it becomes the hover target so the cross-origin
                iframe never shows its internal content-URL tooltip. Clicks bubble up to open detail. */}
            <span className="card__preview-shield" aria-hidden />
            {/* Skeleton shimmer on the gray media background while the 3D boots — sits behind the
                thumbnail (which stays put), so the loading cue shows through/around the asset. */}
            {!previewReady ? <span className="card__skeleton" aria-hidden /> : null}
          </>
        ) : null}
      </div>

      <div className="card__body">
        {/* Title+author sit on one row with the price to their right (Figma). card__desc holds the
            flexible column (min-width:0 so a long name ellipses instead of shoving the price out or
            wrapping); the price never shrinks. */}
        <div className="card__top">
          <div className="card__desc">
            <div className="card__name" title={item.name}>
              {item.name}
            </div>
            {item.creator ? (
              <CreatorBadge address={item.creator} className="card__creator" linkToProfile />
            ) : (
              <div className="card__creator">&nbsp;</div>
            )}
          </div>
          {isMarket && props.mode === 'market' ? (
            <div className="card__price card__price--market">
              <span className="card__approx" aria-hidden>
                ≈
              </span>
              <CurrencyIcon className="card__diamond" />
              {props.marketPriceCredits == null ? '—' : formatCredits(props.marketPriceCredits)}
              <span className="chip card__market-chip">{t('assetCard.marketPrice')}</span>
            </div>
          ) : onSale ? (
            <div className="card__price card__price--sale">
              <span className="card__price-now" title={formatCreditsFull(item.priceCredits)}>
                <CurrencyIcon className="card__diamond" />
                {formatCredits(item.priceCredits)}
              </span>
              <span className="card__price-was" title={formatCreditsFull(item.compareAtCredits!)}>
                <CurrencyIcon className="card__diamond card__diamond--was" />
                {formatCredits(item.compareAtCredits!)}
              </span>
              <SaleCountdown endsAt={item.saleEndsAt} className="card__countdown" />
            </div>
          ) : (
            <div className="card__price" title={formatCreditsFull(item.priceCredits)}>
              <CurrencyIcon className="card__diamond" />
              {formatCredits(item.priceCredits)}
            </div>
          )}
        </div>

        {/* Chips row and the primary action share one fixed-height slot so the card DOESN'T change
            size when the action is revealed on hover/focus — the button (40px tall) replaces the chips
            in place, not below them. Chips show at rest; on hover-capable devices the action is
            revealed on hover OR keyboard focus, and it's always shown where hover isn't available
            (touch) so items stay buyable without a mouse (see .card__action in asset-card.css). Both
            stay in the DOM so the action is keyboard-reachable and touch-tappable. Native cards add to
            cart; Market (legacy) cards Buy now directly (price locked at checkout). */}
        <div className="card__action">
          <div className="card__chips">
            <span
              className="chip chip--rarity"
              style={{ background: rarityTint(item.rarity), color: rarityInk(item.rarity) }}
            >
              {item.rarity}
            </span>
            {item.isSmart ? (
              <span className="chip chip--smart">
                <span className="ico ico-smart" aria-hidden />
                {t('assetCard.smart')}
              </span>
            ) : null}
            {catIco ? (
              <span className="chip chip--icon">
                <span className={`ico ico-${catIco}`} aria-hidden />
              </span>
            ) : null}
            {genderIco ? (
              <span className="chip chip--icon">
                <span className={`ico ico-${genderIco}`} aria-hidden />
              </span>
            ) : null}
          </div>

          {/* Round add button — the compact mobile card's primary action (Figma). Same behavior as the
            full-width .card__cart below; only one is visible per breakpoint (CSS). */}
          {isMarket && props.mode === 'market' ? (
            <button
              className="card__add-round"
              onClick={e => {
                e.stopPropagation()
                props.onBuyNow(item)
              }}
              disabled={props.marketPriceCredits == null}
              aria-label={props.marketPriceCredits == null ? t('assetCard.unavailable') : t('assetCard.buyNow')}
            >
              <span className="ico ico-plus" aria-hidden />
            </button>
          ) : (
            <button
              className={`card__add-round${inCart ? ' is-in' : ''}`}
              onClick={e => {
                e.stopPropagation()
                if (!own) add(item, 'grid')
              }}
              disabled={inCart || own}
              aria-label={own ? t('assetCard.yourItem') : inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
            >
              <span className="ico ico-plus" aria-hidden />
            </button>
          )}

          {isMarket && props.mode === 'market' ? (
            <button
              className="card__cart"
              onClick={e => {
                e.stopPropagation()
                props.onBuyNow(item)
              }}
              disabled={props.marketPriceCredits == null}
            >
              {props.marketPriceCredits == null ? t('assetCard.unavailable') : t('assetCard.buyNow')}
            </button>
          ) : (
            <button
              className={`card__cart${inCart ? ' is-in' : ''}`}
              onClick={e => {
                e.stopPropagation()
                if (!own) add(item, 'grid')
              }}
              disabled={inCart || own}
            >
              {own ? null : <span className="ico ico-cart-solid card__cart-ico" aria-hidden />}
              {own ? t('assetCard.yourItem') : inCart ? t('assetCard.inCart') : t('assetCard.addToCart')}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
