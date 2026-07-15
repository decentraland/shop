import './overview.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchListings, type CatalogItem } from '~/lib/api'
import { AssetCard } from '~/components/AssetCard'
import { FollowedCreatorsRow } from '~/components/FollowedCreatorsRow'
import { RecentlyViewed } from '~/components/RecentlyViewed'
import { WeekTopCreators } from '~/components/WeekTopCreators'
import heroBanner from '~/assets/overview/hero-fashion-week.png'
import promoEmotes from '~/assets/overview/promo-best-rated-emotes.png'
import promoOutfits from '~/assets/overview/promo-week-selected-outfits.png'

// Horizontal card rail with the Figma side arrows + pagination dots (node 913:135571 / 913:135593).
// Reuses the global .row / .row__track so the cards, spacing and hover-glow match the rest of the app;
// the arrows page the scroller by one viewport and the dots reflect/scrub scroll position.
function Carousel({ title, items, loading }: { title: string; items: CatalogItem[]; loading: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(0)

  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const per = el.clientWidth || 1
    // ceil with a 2px slack so a hair of sub-pixel overflow doesn't spawn a phantom extra page.
    const pages = Math.max(1, Math.ceil((el.scrollWidth - 2) / per))
    setPageCount(pages)
    setPage(Math.min(pages - 1, Math.round(el.scrollLeft / per)))
  }, [])

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el) return
    const onScroll = () => measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
    }
  }, [measure, items.length, loading])

  const scrollToPage = useCallback((p: number) => {
    const el = trackRef.current
    if (!el) return
    const target = Math.max(0, Math.min(pageCount - 1, p))
    el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' })
  }, [pageCount])

  const showControls = pageCount > 1

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
            <span className="ico ico-chevron" aria-hidden />
          </button>
        ) : null}
        <div className="row__track" ref={trackRef}>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <div className="card card--skeleton" key={i} />)
            : items.map(item => <AssetCard key={item.id} item={item} />)}
        </div>
        {showControls ? (
          <button
            className="ov-arrow ov-arrow--right"
            onClick={() => scrollToPage(page + 1)}
            disabled={page >= pageCount - 1}
            aria-label="Next"
          >
            <span className="ico ico-chevron" aria-hidden />
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

          {items.length > 12 ? <Carousel title="New Creations" items={items.slice(12, 24)} loading={false} /> : null}
        </>
      ) : (
        <div className="overview__empty">
          <p className="overview__empty-title">New drops are on the way</p>
          <p className="muted">There are no items on sale right now — check back soon.</p>
          <Link className="btn btn--purple" to="/assets">Browse Collectibles</Link>
        </div>
      )}

      <WeekTopCreators />

      <FollowedCreatorsRow />
      <RecentlyViewed />
    </div>
  )
}
