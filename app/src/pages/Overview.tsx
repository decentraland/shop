import './overview.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchListings, type CatalogItem } from '~/lib/api'
import { AssetCard } from '~/components/AssetCard'
import { FollowedCreatorsRow } from '~/components/FollowedCreatorsRow'
import { RecentlyViewed } from '~/components/RecentlyViewed'
import { WeekTopCreators } from '~/components/WeekTopCreators'
import { t } from '~/intl/i18n'
import { useSeo } from '~/hooks/useSeo'
import carouselArrow from '~/assets/icons/carousel-arrow.svg'
import heroBanner from '~/assets/overview/hero-fashion-week.png'
import promoEmotes from '~/assets/overview/promo-best-rated-emotes.png'
import promoOutfits from '~/assets/overview/promo-week-selected-outfits.png'

const SKELETON_COUNT = 6

// Horizontal card rail (Figma nodes 913:135571 "Featured Products" / 913:135593 "New Creations").
// The track is a CSS grid showing a FIXED whole number of cards per view (5 desktop → 4 → 3 → 2 mobile,
// see overview.css `grid-auto-columns`), so an exact integer of cards always fills the viewport with a
// 16px gap — no partial card is ever cut off (matches the Figma). The JS just pages by one viewport
// width and derives the dot count from the scroll extent, so it stays correct at every breakpoint
// without duplicating the per-card width math.
function Carousel({ title, items, loading }: { title: string; items: CatalogItem[]; loading: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(0)

  const count = loading ? SKELETON_COUNT : items.length

  // Recompute the page count (from the scroll extent) and center the arrows on the card media band.
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const view = el.clientWidth
    if (view <= 0) return
    const pages = Math.max(1, Math.ceil((el.scrollWidth - view) / view) + 1)
    setPageCount(pages)
    setPage(Math.min(pages - 1, Math.round(el.scrollLeft / view)))
    const media = el.querySelector<HTMLElement>('.card__media')
    const viewport = el.parentElement
    // 12px = the track's top padding; center on the media so the chevrons sit over the artwork.
    if (viewport) viewport.style.setProperty('--ov-arrow-top', `${12 + (media ? media.offsetHeight : 150) / 2}px`)
  }, [])

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el) return
    const onScroll = () => setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
    }
  }, [measure, count])

  // Page by exactly one viewport width — because a whole number of cards fills the viewport, this
  // always lands on a card boundary (a snap point), never on a partial card.
  const scrollToPage = useCallback(
    (p: number) => {
      const el = trackRef.current
      if (!el) return
      const target = Math.max(0, Math.min(pageCount - 1, p))
      el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' })
    },
    [pageCount]
  )

  const showControls = !loading && pageCount > 1

  return (
    <section className="row ov-carousel">
      <div className="row__head">
        <h2 className="row__title">{title}</h2>
        <Link className="row__viewall" to="/assets">
          {t('overview.viewAll')} <span className="ico ico-viewall" aria-hidden />
        </Link>
      </div>
      <div className="ov-carousel__viewport">
        {showControls ? (
          <button
            className="ov-arrow ov-arrow--left"
            onClick={() => scrollToPage(page - 1)}
            disabled={page <= 0}
            aria-label={t('overview.previous')}
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
            aria-label={t('overview.next')}
          >
            <img src={carouselArrow} alt="" aria-hidden />
          </button>
        ) : null}
      </div>
      {showControls ? (
        <div className="ov-carousel__dots" aria-label={t('overview.carouselPages', { title })}>
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              className={`ov-dot${i === page ? ' is-active' : ''}`}
              onClick={() => scrollToPage(i)}
              aria-label={t('overview.goToPage', { page: i + 1 })}
              aria-current={i === page ? 'true' : undefined}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function Overview() {
  // Home page: the hook's site-wide default title/description is the best fit here (its title tail is
  // "Wearables & Emotes for Your Avatar", which we don't want to override), so pass nothing. Indexable.
  useSeo({})
  // Only credit-buyable (USD-pegged) listings — not the primary mint catalog.
  const { data, isLoading } = useQuery({ queryKey: ['overview-listings'], queryFn: () => fetchListings({ first: 24 }) })
  const items = data?.items ?? []

  return (
    <div className="overview">
      <section className="ov-hero">
        <img className="ov-hero__bg" src={heroBanner} alt="" aria-hidden />
        <div className="ov-hero__scrim" aria-hidden />
        <div className="ov-hero__inner">
          <h1 className="ov-hero__title">{t('overview.heroTitle')}</h1>
          <Link className="btn btn--purple ov-hero__cta" to="/assets">
            {t('overview.exploreCollection')}
          </Link>
        </div>
      </section>

      {isLoading || items.length > 0 ? (
        <>
          <Carousel title={t('overview.featuredProducts')} items={items.slice(0, 12)} loading={isLoading} />

          {/* Promo tiles (Figma node 913:135589). Placeholder art — see report for production source. */}
          <section className="ov-promos">
            <Link className="ov-promo" to="/assets" aria-label={t('overview.promoEmotesAria')}>
              <img src={promoEmotes} alt={t('overview.promoEmotesAlt')} />
            </Link>
            <Link className="ov-promo" to="/assets" aria-label={t('overview.promoOutfitsAria')}>
              <img src={promoOutfits} alt={t('overview.promoOutfitsAlt')} />
            </Link>
          </section>

          {/* New Creations carousel — needs a second page of listings (>12) to be worth showing. */}
          {items.length > 12 ? <Carousel title={t('overview.newCreations')} items={items.slice(12, 24)} loading={false} /> : null}
        </>
      ) : (
        <div className="overview__empty">
          <p className="overview__empty-title">{t('overview.emptyTitle')}</p>
          <p className="muted">{t('overview.emptyBody')}</p>
          <Link className="btn btn--purple" to="/assets">
            {t('notFound.cta')}
          </Link>
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
