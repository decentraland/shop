import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { useSaleActive } from '~/hooks/useSaleActive'
import type { CatalogItem } from '~/lib/api'

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
      {/* The shared 3D preview (HoverPreviewLayer) overlays this element on hover; mediaRef gives it the
          rect to position over. */}
      <div className="card__media" ref={mediaRef}>
        {onSale ? (
          <span className="card__sale-badge">
            SALE{discountPct > 0 ? ` -${discountPct}%` : ''}
          </span>
        ) : null}
        <button
          className={`card__fav${faved ? ' is-on' : ''}`}
          onClick={e => { e.stopPropagation(); toggleFav(item) }}
          aria-label={faved ? 'Remove from favorites' : 'Add to favorites'}
        >
          <span className="ico ico-heart" aria-hidden />
        </button>
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
        {/* Slim loading bar while the shared 3D swaps in this item — the thumbnail stays put underneath. */}
        {hovered && canPreview && !previewReady ? <span className="card__loadbar" aria-hidden /> : null}
      </div>

      <div className="card__body">
        {/* Top row: name/creator on the left, price on the right (matching the Figma card). The
            name/creator stay put; on hover-capable devices the price + chips are swapped for the
            primary action on hover OR keyboard focus, and where hover isn't available (touch) the
            action is always shown so items stay buyable without a mouse (see .card__cart in index.css).
            Everything stays in the DOM so the action button is keyboard-reachable and touch-tappable.
            Native cards add to cart; Market (legacy) cards Buy now directly (price locked at checkout). */}
        <div className="card__desc">
          <div className="card__name" title={item.name}>{item.name}</div>
            {item.creator ? (
              <CreatorBadge address={item.creator} className="card__creator" linkToProfile />
            ) : (
              <div className="card__creator">&nbsp;</div>
            )}
          </div>

          {isMarket && props.mode === 'market' ? (
            <div className="card__price card__price--market">
              <span className="card__approx" aria-hidden>≈</span>
              <CurrencyIcon className="card__diamond" />
              {props.marketPriceCredits == null ? '—' : props.marketPriceCredits}
              <span className="chip card__market-chip">Market price</span>
            </div>
          ) : onSale ? (
            <div className="card__price card__price--sale">
              <span className="card__price-now">
                <CurrencyIcon className="card__diamond" />
                {item.priceCredits}
              </span>
              <span className="card__price-was">
                <CurrencyIcon className="card__diamond card__diamond--was" />
                {item.compareAtCredits}
              </span>
              <SaleCountdown endsAt={item.saleEndsAt} className="card__countdown" />
            </div>
          ) : (
            <div className="card__price">
              <CurrencyIcon className="card__diamond" />
              {item.priceCredits}
            </div>
          )}

        <div className="card__chips">
          <span
            className="chip chip--rarity"
            style={{ background: rarityTint(item.rarity), color: rarityInk(item.rarity) }}
          >
            {item.rarity}
          </span>
          {catIco ? (
            <span className="chip chip--icon"><span className={`ico ico-${catIco}`} aria-hidden /></span>
          ) : null}
          {genderIco ? (
            <span className="chip chip--icon"><span className={`ico ico-${genderIco}`} aria-hidden /></span>
          ) : null}
        </div>

        {/* Round add button — the compact mobile card's primary action (Figma). Same behavior as the
            full-width .card__cart below; only one is visible per breakpoint (CSS). */}
        {isMarket && props.mode === 'market' ? (
          <button
            className="card__add-round"
            onClick={e => { e.stopPropagation(); props.onBuyNow(item) }}
            disabled={props.marketPriceCredits == null}
            aria-label={props.marketPriceCredits == null ? 'Unavailable' : 'Buy now'}
          >
            +
          </button>
        ) : (
          <button
            className={`card__add-round${inCart ? ' is-in' : ''}`}
            onClick={e => { e.stopPropagation(); if (!own) add(item, 'grid') }}
            disabled={inCart || own}
            aria-label={own ? 'Your item' : inCart ? 'In cart' : 'Add to cart'}
          >
            +
          </button>
        )}

        {isMarket && props.mode === 'market' ? (
          <button
            className="card__cart"
            onClick={e => { e.stopPropagation(); props.onBuyNow(item) }}
            disabled={props.marketPriceCredits == null}
          >
            {props.marketPriceCredits == null ? 'Unavailable' : 'Buy now'}
          </button>
        ) : (
          <button
            className={`card__cart${inCart ? ' is-in' : ''}`}
            onClick={e => { e.stopPropagation(); if (!own) add(item, 'grid') }}
            disabled={inCart || own}
          >
            {own ? null : <span className="ico ico-cart-solid card__cart-ico" aria-hidden />}
            {own ? 'Your item' : inCart ? 'In cart' : 'Add to cart'}
          </button>
        )}
      </div>
    </article>
  )
}
