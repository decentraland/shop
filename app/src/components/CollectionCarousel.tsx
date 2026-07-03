import { useRef } from 'react'
import { useCart } from '~/store/cart'
import { toast } from '~/store/toast'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import type { CatalogItem } from '~/lib/api'

function genderGlyph(gender: CatalogItem['gender']): string {
  if (gender === 'male') return '♂'
  if (gender === 'female') return '♀'
  if (gender === 'unisex') return '⚥'
  return ''
}

// Horizontal row of sibling items from the same collection. Static thumbnails only (one live hero
// preview lives on the detail page — we never spawn a WearablePreview iframe per card). Clicking a
// card calls onSelect, which swaps the hero in place (no full reload) so several items can be browsed
// and added to the cart.
export function CollectionCarousel({
  title,
  items,
  activeId,
  onSelect
}: {
  title: string
  items: CatalogItem[]
  activeId?: string
  onSelect: (item: CatalogItem) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const add = useCart(s => s.add)
  const cartIds = useCart(s => s.items.map(i => i.id))

  if (items.length === 0) return null

  function quickAdd(item: CatalogItem) {
    add(item, 'carousel')
    toast.success(`“${item.name}” added to your cart.`)
  }

  function scrollBy(dir: 1 | -1) {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: dir * Math.round(track.clientWidth * 0.8), behavior: 'smooth' })
  }

  return (
    <section className="collection-carousel">
      <div className="collection-carousel__head">
        <h2 className="collection-carousel__title">{title}</h2>
        <div className="collection-carousel__arrows">
          <button
            className="collection-carousel__arrow"
            onClick={() => scrollBy(-1)}
            aria-label="Scroll left"
          >
            ‹
          </button>
          <button
            className="collection-carousel__arrow"
            onClick={() => scrollBy(1)}
            aria-label="Scroll right"
          >
            ›
          </button>
        </div>
      </div>

      <div className="collection-carousel__track" ref={trackRef}>
        {items.map(item => {
          const gender = genderGlyph(item.gender)
          const isActive = item.id === activeId
          const listed = item.priceCredits > 0
          const inCart = cartIds.includes(item.id)
          return (
            <article
              key={item.id}
              className={`collection-carousel__card${isActive ? ' is-active' : ''}`}
              onClick={() => onSelect(item)}
              role="button"
              tabIndex={0}
              aria-current={isActive || undefined}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(item)
                }
              }}
            >
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
                <div className="collection-carousel__name" title={item.name}>
                  {item.name}
                </div>
                <div className="collection-carousel__meta">
                  {listed ? (
                    <span className="collection-carousel__price">
                      <CurrencyIcon className="collection-carousel__diamond" />
                      {item.priceCredits}
                    </span>
                  ) : (
                    <span className="collection-carousel__price collection-carousel__na">Not listed</span>
                  )}
                  <span className="collection-carousel__chips">
                    <span className="chip chip--rarity">{item.rarity}</span>
                    {gender ? <span className="chip chip--icon">{gender}</span> : null}
                  </span>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default CollectionCarousel
