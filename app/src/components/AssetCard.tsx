import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { WearablePreview } from 'decentraland-ui2/dist/components/WearablePreview'
import { config } from '~/config'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import { CreatorBadge } from '~/components/CreatorBadge'
import { rarityColor, readableText } from '~/lib/rarity'
import type { CatalogItem } from '~/lib/api'

const HOVER_DELAY_MS = 120
// Keep the preview shimmer on briefly after onLoad so the iframe's own cross-origin spinner never
// flashes ("shimmer then spinner" double-load fix, mirrors the reskin).
const PREVIEW_GRACE_MS = 600

function genderGlyph(gender: CatalogItem['gender']): string {
  if (gender === 'male') return '♂'
  if (gender === 'female') return '♀'
  if (gender === 'unisex') return '⚥'
  return ''
}

export function AssetCard({ item }: { item: CatalogItem }) {
  const [hovered, setHovered] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const graceTimer = useRef<ReturnType<typeof setTimeout>>()

  const add = useCart(s => s.add)
  const inCart = useCart(s => s.items.some(i => i.id === item.id))
  const toggleFav = useFavorites(s => s.toggle)
  const faved = useFavorites(s => !!s.items[item.id])
  const navigate = useNavigate()

  const canPreview = !!item.contractAddress && !!item.itemId
  // Secondary listings carry tokenId; catalog items carry itemId — use whichever is present so the
  // /item/:contractAddress/:tokenId route segment is always populated.
  const routeSeg = item.tokenId ?? item.itemId
  const canOpen = !!item.contractAddress && !!routeSeg

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

  return (
    <article
      className={`card${hovered ? ' card--hover' : ''}`}
      style={canOpen ? { cursor: 'pointer' } : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={openDetail}
      role={canOpen ? 'link' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onKeyDown={canOpen ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail() } } : undefined}
    >
      <div className="card__media">
        <button
          className={`card__fav${faved ? ' is-on' : ''}`}
          onClick={e => { e.stopPropagation(); toggleFav(item) }}
          aria-label={faved ? 'Remove from favorites' : 'Add to favorites'}
        >
          <span className="ico ico-heart" aria-hidden />
        </button>
        {/* Thumbnail is the placeholder; it stays while the 3D loads (no empty frame), then fades
            out once the preview is ready so the transparent 3D doesn't sit on top of the flat photo. */}
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
              {!previewReady ? <span className="card__preview-skel" aria-hidden /> : null}
              <WearablePreview
                contractAddress={item.contractAddress}
                itemId={item.itemId ?? undefined}
                profile="default"
                dev={config.chainId === 80002}
                disableBackground
                disableFadeEffect
                onLoad={onPreviewLoad}
              />
            </div>
            {/* Transparent shield over the preview: it becomes the hover target so the cross-origin
                iframe never shows its internal content-URL tooltip. Clicks bubble up to open detail. */}
            <span className="card__preview-shield" aria-hidden />
          </>
        ) : null}

        {/* Add-to-cart lives over the media and slides up on hover (see .card__cart). */}
        <button
          className={`card__cart${inCart ? ' is-in' : ''}`}
          onClick={e => { e.stopPropagation(); add(item) }}
          disabled={inCart}
        >
          <span className="ico ico-cart-solid card__cart-ico" aria-hidden />
          {inCart ? 'IN CART' : 'ADD TO CART'}
        </button>
      </div>

      <div className="card__body">
        <div className="card__name" title={item.name}>{item.name}</div>
        {item.creator ? (
          <CreatorBadge address={item.creator} className="card__creator" />
        ) : (
          <div className="card__creator">&nbsp;</div>
        )}

        <div className="card__meta">
          <div className="card__price">
            <span className="ico ico-credits card__diamond" aria-hidden />
            {item.priceCredits}
          </div>
          <div className="card__chips">
            <span
              className="chip chip--rarity"
              style={{ background: rarityColor(item.rarity), color: readableText(rarityColor(item.rarity)) }}
            >
              {item.rarity}
            </span>
            {item.category === 'wearable' ? (
              <span className="chip chip--icon"><span className="ico ico-eyewear" aria-hidden /></span>
            ) : null}
            {gender ? <span className="chip chip--icon">{gender}</span> : null}
          </div>
        </div>
      </div>
    </article>
  )
}
