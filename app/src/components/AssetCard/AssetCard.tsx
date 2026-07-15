import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PreviewEmote, PreviewType } from '@dcl/schemas'
import { WearablePreview } from '~/components/LazyWearablePreview'
import { config } from '~/config'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import { useWallet } from '~/store/wallet'
import { isOwnListing } from '~/lib/ownership'
import { CreatorBadge } from '~/components/CreatorBadge'
import { rarityColor } from '~/lib/rarity'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { SaleCountdown } from '~/components/SaleCountdown'
import { saleDiscountPct } from '~/lib/sale'
import { formatCredits, formatCreditsFull } from '~/lib/currency'
import { t } from '~/intl/i18n'
import { useSaleActive } from '~/hooks/useSaleActive'
import type { CatalogItem } from '~/lib/api'
import './asset-card.css'

const HOVER_DELAY_MS = 120
// WearablePreview's onLoad fires on the iframe's LOAD message = scene actually rendered (not just the
// app booting). We keep the flat thumbnail up the whole time and only crossfade to the 3D once ready,
// so there's never an empty frame. A short grace guarantees the first painted frame before we swap.
const PREVIEW_GRACE_MS = 250

function genderGlyph(gender: CatalogItem['gender']): string {
  if (gender === 'male') return '♂'
  if (gender === 'female') return '♀'
  if (gender === 'unisex') return '⚥'
  return ''
}

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
  const [previewReady, setPreviewReady] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const graceTimer = useRef<ReturnType<typeof setTimeout>>()

  const add = useCart(s => s.add)
  const inCart = useCart(s => s.items.some(i => i.id === item.id))
  const address = useWallet(s => s.session?.address)
  // Your own (primary) listing — can't add it to the cart (see lib/ownership.ts).
  const own = isOwnListing(item, address)
  const toggleFav = useFavorites(s => s.toggle)
  const faved = useFavorites(s => !!s.items[item.id])
  const navigate = useNavigate()

  const canPreview = !!item.contractAddress && !!item.itemId
  // Secondary listings carry tokenId; catalog items carry itemId — use whichever is present so the
  // /item/:contractAddress/:tokenId route segment is always populated.
  const routeSeg = item.tokenId ?? item.itemId
  // Market (legacy) cards don't open the item-detail page — those listings aren't in the USD-pegged
  // shop feed the detail page reads, so Buy now is the only action. Keeps the tab self-contained.
  const canOpen = !isMarket && !!item.contractAddress && !!routeSeg

  function openDetail() {
    if (!canOpen) return
    navigate(`/item/${item.contractAddress}/${routeSeg}`, { state: { item, tradeId: item.tradeId } })
  }

  function onEnter() {
    if (timer.current) clearTimeout(timer.current)
    if (graceTimer.current) clearTimeout(graceTimer.current)
    setPreviewReady(false)
    timer.current = setTimeout(() => setHovered(true), HOVER_DELAY_MS)
  }
  function onLeave() {
    if (timer.current) clearTimeout(timer.current)
    if (graceTimer.current) clearTimeout(graceTimer.current)
    setHovered(false)
    setPreviewReady(false)
  }
  function onPreviewLoad() {
    if (graceTimer.current) clearTimeout(graceTimer.current)
    graceTimer.current = setTimeout(() => setPreviewReady(true), PREVIEW_GRACE_MS)
  }

  const gender = genderGlyph(item.gender)

  // Flash sale only applies to native (fixed-price) listings — a market card's credit price
  // fluctuates, so a strike-through compare-at would be meaningless there.
  const saleActive = useSaleActive({
    priceCredits: item.priceCredits,
    compareAtCredits: item.compareAtCredits,
    saleEndsAt: item.saleEndsAt,
  })
  const onSale = !isMarket && saleActive
  const discountPct = onSale ? saleDiscountPct(item.compareAtCredits!, item.priceCredits) : 0

  const rarityColors = rarityColor(item.rarity)

  return (
    <article
      className={`card${hovered ? ' card--hover' : ''}`}
      style={canOpen ? { cursor: 'pointer' } : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={openDetail}
      role={canOpen ? 'link' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onKeyDown={
        canOpen
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openDetail()
              }
            }
          : undefined
      }
    >
      <div className="card__media">
        {onSale ? (
          <span className="card__sale-badge">
            {discountPct > 0 ? t('assetCard.saleWithDiscount', { pct: discountPct }) : t('assetCard.sale')}
          </span>
        ) : null}
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
        {/* Flat thumbnail stays visible the whole time the 3D loads (no empty frame); it only fades
            out once the preview is ready, crossfading into the 3D. */}
        {item.thumbnail ? (
          <img
            className={`card__img${hovered && previewReady ? ' card__img--hidden' : ''}`}
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
                dev={config.chainId === 80002}
                disableBackground
                disableFadeEffect
                onLoad={onPreviewLoad}
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
              style={{ background: rarityColors.background, color: rarityColors.text }}
            >
              {item.rarity}
            </span>
            {item.isSmart ? (
              <span className="chip chip--smart">
                <span className="ico ico-smart" aria-hidden />
                {t('assetCard.smart')}
              </span>
            ) : null}
            {item.category === 'wearable' ? (
              <span className="chip chip--icon">
                <span className="ico ico-eyewear" aria-hidden />
              </span>
            ) : null}
            {gender ? <span className="chip chip--icon">{gender}</span> : null}
          </div>
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
