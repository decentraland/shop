import './overview.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchListings, type CatalogItem } from '~/lib/api'
import { AssetCard } from '~/components/AssetCard'
import { FollowedCreatorsRow } from '~/components/FollowedCreatorsRow'
import { RecentlyViewed } from '~/components/RecentlyViewed'
import { WeekTopCreators } from '~/components/WeekTopCreators'
import carouselArrow from '~/assets/icons/carousel-arrow.svg'
import heroBanner from '~/assets/overview/hero-fashion-week.png'
import promoEmotes from '~/assets/overview/promo-best-rated-emotes.png'
import promoOutfits from '~/assets/overview/promo-week-selected-outfits.png'

// Card sizing must mirror the browse grid (index.css `.grid` = repeat(auto-fill, minmax(250px,1fr))
// with a 16px gap) so carousel cards are visually identical to the grid cards.
const GAP = 16
const MIN_CARD = 250
// Horizontal glow gutter: the track carries `padding: 12px 10px; margin: 0 -10px` (like the global
// `.row__track`) so the outward card hover-glow isn't clipped. clientWidth therefore includes 20px of
// padding that isn't part of the visible card area — subtract it before doing the whole-card math.
const GLOW_GUTTER = 20
const SKELETON_COUNT = 6

// Horizontal card rail (Figma nodes 913:135571 "Featured Products" / 913:135593 "New Creations").
// Whole-card guarantee: card widths are computed so an integer number of cards + 16px gaps exactly
// fill the viewport (same fluid width as the browse grid). Combined with `scroll-snap-type: x mandatory`
// + `scroll-snap-align: start` (see overview.css) the scroller can only ever rest on a whole card, so
// no partial card is ever cut off — at any width, or after clicking an arrow / dot.
function Carousel({ title, items, loading }: { title: string; items: CatalogItem[]; loading: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(0)

  const count = loading ? SKELETON_COUNT : items.length

  // Columns that fit the viewport, matching CSS `auto-fill, minmax(250px, 1fr)`.
  const columnsFor = useCallback((avail: number) => {
    return Math.max(1, Math.floor((avail + GAP) / (MIN_CARD + GAP)))
  }, [])

  // Recompute the fluid card width, the per-page step and the page count. Writes the resulting card
  // width to a CSS var on the track so every card (and skeleton) flexes to the exact whole-card size,
  // and the arrow vertical offset so the chevrons sit centered on the card media band.
  const layout = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const avail = el.clientWidth - GLOW_GUTTER
    if (avail <= 0) return
    const cols = columnsFor(avail)
    const cardW = (avail - (cols - 1) * GAP) / cols
    el.style.setProperty('--ov-card-w', `${cardW}px`)
    const viewport = el.parentElement
    // Card media keeps a 281:204 aspect ratio (see .card__media); center the arrows on it (12px = the
    // track's top padding).
    if (viewport) viewport.style.setProperty('--ov-arrow-top', `${12 + (cardW * 204) / 281 / 2}px`)
    const step = cols * (cardW + GAP)
    const pages = Math.max(1, Math.ceil(count / cols))
    setPageCount(pages)
    setPage(Math.min(pages - 1, Math.round(el.scrollLeft / step)))
  }, [columnsFor, count])

  // Track only the page index on scroll (cheap) — layout() handles resize/content changes.
  const syncPage = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const avail = el.clientWidth - GLOW_GUTTER
    if (avail <= 0) return
    const cols = columnsFor(avail)
    const cardW = (avail - (cols - 1) * GAP) / cols
    const step = cols * (cardW + GAP)
    setPage(Math.max(0, Math.round(el.scrollLeft / step)))
  }, [columnsFor])

  useEffect(() => {
    layout()
    const el = trackRef.current
    if (!el) return
    el.addEventListener('scroll', syncPage, { passive: true })
    window.addEventListener('resize', layout)
    return () => {
      el.removeEventListener('scroll', syncPage)
      window.removeEventListener('resize', layout)
    }
  }, [layout, syncPage])

  // Page by whole card-columns. Because cols cards exactly fill the viewport, scrolling by
  // cols*(cardW+gap) lands the scroller precisely on the first card of the next page (a snap point) —
  // never on a partial card.
  const scrollToPage = useCallback((p: number) => {
    const el = trackRef.current
    if (!el) return
    const avail = el.clientWidth - GLOW_GUTTER
    if (avail <= 0) return
    const cols = columnsFor(avail)
    const cardW = (avail - (cols - 1) * GAP) / cols
    const step = cols * (cardW + GAP)
    const target = Math.max(0, Math.min(pageCount - 1, p))
    el.scrollTo({ left: target * step, behavior: 'smooth' })
  }, [columnsFor, pageCount])

  const showControls = !loading && pageCount > 1

  return (
    <section className="row ov-carousel">
      <div className="row__head">
        <h2 className="row__title">{title}</h2>
        <Link className="row__viewall" to="/assets">View all <span className="ico ico-viewall" aria-hidden /></Link>
      </div>
      <div className="ov-carousel__viewport">
        {showControls ? (
          <button
            className="ov-arrow ov-arrow--left"
            onClick={() => scrollToPage(page - 1)}
            disabled={page <= 0}
            aria-label="Previous"
          >
            <img src={carouselArrow} alt="" aria-hidden />
          </button>
        ) : null}
        <div className="ov-carousel__track" ref={trackRef}>
          {loading
            ? Array.from({ length: SKELETON_COUNT }).map((_, i) => <div className="card card--skeleton" key={i} />)
            : items.map(item => <AssetCard key={item.id} item={item} />)}
        </div>
        {showControls ? (
          <button
            className="ov-arrow ov-arrow--right"
            onClick={() => scrollToPage(page + 1)}
            disabled={page >= pageCount - 1}
            aria-label="Next"
          >
            <img src={carouselArrow} alt="" aria-hidden />
          </button>
        ) : null}
      </div>
      {showControls ? (
        <div className="ov-carousel__dots" role="tablist" aria-label={`${title} pages`}>
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              className={`ov-dot${i === page ? ' is-active' : ''}`}
              onClick={() => scrollToPage(i)}
              aria-label={`Go to page ${i + 1}`}
              aria-selected={i === page}
              role="tab"
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function Overview() {
  // Only credit-buyable (USD-pegged) listings — not the primary mint catalog.
  const { data, isLoading } = useQuery({ queryKey: ['overview-listings'], queryFn: () => fetchListings({ first: 24 }) })
  const items = data?.items ?? []

  return (
    <div className="overview">
      <section className="ov-hero">
        <img className="ov-hero__bg" src={heroBanner} alt="" aria-hidden />
        <div className="ov-hero__scrim" aria-hidden />
        <div className="ov-hero__inner">
          <h1 className="ov-hero__title">Fashion week outfits</h1>
          <Link className="btn btn--purple ov-hero__cta" to="/assets">Explore collection</Link>
        </div>
      </section>

      {isLoading || items.length > 0 ? (
        <>
          <Carousel title="Featured Products" items={items.slice(0, 12)} loading={isLoading} />

          {/* Promo tiles (Figma node 913:135589). Placeholder art — see report for production source. */}
          <section className="ov-promos">
            <Link className="ov-promo" to="/assets" aria-label="Best rated emotes — explore collection">
              <img src={promoEmotes} alt="Best rated emotes" />
            </Link>
            <Link className="ov-promo" to="/assets" aria-label="Week selected outfits — explore collection">
              <img src={promoOutfits} alt="Week selected outfits" />
            </Link>
          </section>

          {/* New Creations carousel — needs a second page of listings (>12) to be worth showing. */}
          {items.length > 12 ? <Carousel title="New Creations" items={items.slice(12, 24)} loading={false} /> : null}
        </>
      ) : (
        <div className="overview__empty">
          <p className="overview__empty-title">New drops are on the way</p>
          <p className="muted">There are no items on sale right now — check back soon.</p>
          <Link className="btn btn--purple" to="/assets">Browse Collectibles</Link>
        </div>
      )}

      {/* Discovery rows, then the Week Top Creators ranking table dead last — matching the Figma frame
          order (913:135556): hero → Featured → promos → New Creations → … → Active Ranking at the very
          bottom. RecentlyViewed / FollowedCreatorsRow render nothing until they have data. */}
      <RecentlyViewed />
      <FollowedCreatorsRow />
      <WeekTopCreators />
    </div>
  )
}
