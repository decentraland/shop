import { useCallback, useEffect, useRef, useState } from 'react'
import { AssetCard } from '~/components/AssetCard'
import { t } from '~/intl/i18n'
import carouselArrow from '~/assets/icons/carousel-arrow.svg'
import type { CatalogItem } from '~/lib/api'
import './CollectionCarousel.css'

// Horizontal row of sibling items from the same collection. Renders the SHARED <AssetCard> (identical
// to the browse grid / Overview rails) so a card here is visually indistinguishable from a card
// anywhere else. Clicking a card navigates to that item via AssetCard's own whole-card link (the PDP
// re-hydrates from the passed router state); add-to-cart lives on the card too. This component only
// owns the carousel shell: viewport, side arrows, paging dots and scroll-snap.
export function CollectionCarousel({
  title,
  items,
  onViewAll
}: {
  title: string
  items: CatalogItem[]
  /** When set, shows a "View all" link (→ the full collection page). */
  onViewAll?: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)

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
            {t('collectionCarousel.viewAll')}
            <span className="ico ico-chevron collection-carousel__viewall-ico" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="collection-carousel__viewport">
        <button
          className="collection-carousel__arrow collection-carousel__arrow--left"
          onClick={() => scrollByDir(-1)}
          aria-label={t('collectionCarousel.scrollLeft')}
          disabled={atStart}
        >
          <img src={carouselArrow} alt="" aria-hidden />
        </button>

        <div className="collection-carousel__track" ref={trackRef}>
          {items.map(item => (
            <AssetCard key={item.id} item={item} />
          ))}
        </div>

        <button
          className="collection-carousel__arrow collection-carousel__arrow--right"
          onClick={() => scrollByDir(1)}
          aria-label={t('collectionCarousel.scrollRight')}
          disabled={atEnd}
        >
          <img src={carouselArrow} alt="" aria-hidden />
        </button>
      </div>

      {pages > 1 ? (
        <div className="collection-carousel__dots" aria-label={t('collectionCarousel.pages')}>
          {Array.from({ length: pages }).map((_, i) => (
            <button
              key={i}
              className={`collection-carousel__dot${i === page ? ' is-active' : ''}`}
              aria-label={t('collectionCarousel.goToPage', { page: i + 1 })}
              aria-current={i === page ? 'true' : undefined}
              onClick={() => scrollToPage(i)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export default CollectionCarousel
