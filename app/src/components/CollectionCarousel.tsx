import { useCallback, useEffect, useRef, useState } from 'react'
import { useCart } from '~/store/cart'
import { toast } from '~/store/toast'
import { CreatorBadge } from '~/components/CreatorBadge'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { rarityInk, rarityTint } from '~/lib/rarity'
import { categoryIcon, genderIcon } from '~/lib/itemIcons'
import type { CatalogItem } from '~/lib/api'

// Horizontal row of sibling items from the same collection. Static thumbnails only (one live hero
// preview lives on the detail page — we never spawn a WearablePreview iframe per card). Clicking a
// card calls onSelect, which swaps the hero in place (no full reload) so several items can be browsed
// and added to the cart.
export function CollectionCarousel({
  title,
  items,
  activeId,
  onSelect,
  onViewAll
}: {
  title: string
  items: CatalogItem[]
  activeId?: string
  onSelect: (item: CatalogItem) => void
  /** When set, shows a "View all" link (→ the full collection page). */
  onViewAll?: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const add = useCart(s => s.add)
  const cartIds = useCart(s => s.items.map(i => i.id))

  // Paging state for the side arrows + dots. Recomputed from the track's scroll metrics so the dots
  // reflect real scroll position (proportional pages, not one dot per card).
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(0)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const measure = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const { scrollLeft, scrollWidth, clientWidth } = track
    const count = Math.max(1, Math.ceil(scrollWidth / clientWidth))
    setPages(count)
    setPage(Math.min(count - 1, Math.round(scrollLeft / clientWidth)))
    setAtStart(scrollLeft <= 1)
    setAtEnd(scrollLeft + clientWidth >= scrollWidth - 1)
  }, [])

  useEffect(() => {
    measure()
    const track = trackRef.current
    if (!track) return
    track.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      track.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [measure, items.length])

  if (items.length === 0) return null

  function quickAdd(item: CatalogItem) {
    add(item, 'carousel')
    toast.success(`“${item.name}” added to your cart.`)
  }

  function scrollByDir(dir: 1 | -1) {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' })
  }

  function scrollToPage(p: number) {
    const track = trackRef.current
    if (!track) return
    track.scrollTo({ left: p * track.clientWidth, behavior: 'smooth' })
  }

  return (
    <section className="collection-carousel">
      <div className="collection-carousel__head">
        <h2 className="collection-carousel__title">{title}</h2>
        {onViewAll ? (
          <button className="collection-carousel__viewall" onClick={onViewAll}>
            View all
            <span className="ico ico-chevron collection-carousel__viewall-ico" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="collection-carousel__viewport">
        <button
          className="collection-carousel__arrow collection-carousel__arrow--left"
          onClick={() => scrollByDir(-1)}
          aria-label="Scroll left"
          disabled={atStart}
        >
          ‹
        </button>

        <div className="collection-carousel__track" ref={trackRef}>
          {items.map(item => {
            const catIco = categoryIcon(item)
            const genderIco = genderIcon(item.gender)
            const isActive = item.id === activeId
            const listed = item.priceCredits > 0
            const inCart = cartIds.includes(item.id)
            return (
              <article key={item.id} className={`collection-carousel__card${isActive ? ' is-active' : ''}`}>
                {/* Single overlaid button for "view this item" (keyboard + screen-reader reachable),
                    instead of an <article role="button"> wrapping the add-to-cart button — nesting
                    interactive controls is invalid + breaks SR/tab order. It sits UNDER the add button
                    (z-index) so that control stays independently clickable. */}
                <button
                  className="collection-carousel__select"
                  aria-label={`View ${item.name}`}
                  aria-current={isActive || undefined}
                  onClick={() => onSelect(item)}
                />
                <div className="collection-carousel__media">
                  {item.thumbnail ? (
                    <img
                      className="collection-carousel__img"
                      src={item.thumbnail}
                      alt={item.name}
                      loading="lazy"
                    />
                  ) : null}
                  {listed ? (
                    <button
                      className="collection-carousel__add"
                      disabled={inCart}
                      aria-label={inCart ? 'In cart' : `Add ${item.name} to cart`}
                      title={inCart ? 'In cart' : 'Add to cart'}
                      onClick={e => {
                        e.stopPropagation()
                        if (!inCart) quickAdd(item)
                      }}
                    >
                      <span className={`ico ${inCart ? 'ico-cart-solid' : 'ico-cart'}`} aria-hidden />
                    </button>
                  ) : null}
                </div>
                <div className="collection-carousel__body">
                  <div className="collection-carousel__row">
                    <div className="collection-carousel__name" title={item.name}>
                      {item.name}
                    </div>
                    {listed ? (
                      <span className="collection-carousel__price">
                        <CurrencyIcon className="collection-carousel__diamond" />
                        {item.priceCredits}
                      </span>
                    ) : (
                      <span className="collection-carousel__price collection-carousel__na">Not listed</span>
                    )}
                  </div>
                  {item.creator ? (
                    <CreatorBadge address={item.creator} className="collection-carousel__creator" linkToProfile />
                  ) : null}
                  <span className="collection-carousel__chips">
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
                  </span>
                </div>
              </article>
            )
          })}
        </div>

        <button
          className="collection-carousel__arrow collection-carousel__arrow--right"
          onClick={() => scrollByDir(1)}
          aria-label="Scroll right"
          disabled={atEnd}
        >
          ›
        </button>
      </div>

      {pages > 1 ? (
        <div className="collection-carousel__dots" role="tablist" aria-label="Carousel pages">
          {Array.from({ length: pages }).map((_, i) => (
            <button
              key={i}
              className={`collection-carousel__dot${i === page ? ' is-active' : ''}`}
              aria-label={`Go to page ${i + 1}`}
              aria-selected={i === page}
              role="tab"
              onClick={() => scrollToPage(i)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export default CollectionCarousel
