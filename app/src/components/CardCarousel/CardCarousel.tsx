import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '~/intl/i18n'
import { Icon } from '~/components/Icon'
import carouselArrow from '~/assets/icons/carousel-arrow.svg'
import * as Row from '~/styles/row.styles'
import * as S from './CardCarousel.styles'

type Props = {
  title: string
  /** Number of cards in the rail; drives the re-measure and whether controls show. */
  count: number
  /** Hide the arrows/dots while the rail is showing skeletons. */
  loading?: boolean
  /** Renders a "View all" link in the head when set. */
  viewAllTo?: string
  children: ReactNode
}

// Horizontal card rail (Featured Products / New Creations / the avatar showcase).
// The track is a CSS grid showing a FIXED whole number of cards per view (5 desktop → 4 → 3 → 2 mobile,
// see CardCarousel.styles.ts `grid-auto-columns`), so an exact integer of cards always fills the viewport
// with a 16px gap — no partial card is ever cut off. The JS just pages by one viewport width and derives
// the dot count from the scroll extent, so it stays correct at every breakpoint without duplicating the
// per-card width math.
/**
 * Which page the rail is actually showing.
 *
 * The last page is a PARTIAL one: `pageCount` counts it, but its nominal offset (`page * view`) is past
 * `scrollWidth - clientWidth`, so the browser clamps the scroll short of it. Plain
 * `round(scrollLeft / view)` then rounds that clamped position back DOWN to the page before it, and the
 * last page can never be the current one — which left the right arrow enabled at the end with nowhere to
 * go, the last dot never lit, and a step back from the end jumping more than one page.
 *
 * So the end is anchored explicitly. `ceil(maxScroll / view)` is exactly `pageCount - 1` by the same
 * arithmetic that produced it, which is what keeps the two in agreement.
 */
function pageFromScroll(el: HTMLElement): number {
  const view = Math.max(1, el.clientWidth)
  const maxScroll = el.scrollWidth - el.clientWidth
  if (maxScroll <= 0) return 0
  // Sub-pixel layout means the resting position can land a hair short of maxScroll.
  if (el.scrollLeft >= maxScroll - 1) return Math.max(0, Math.ceil(maxScroll / view))
  return Math.round(el.scrollLeft / view)
}

export function CardCarousel({ title, count, loading = false, viewAllTo, children }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(0)

  // Recompute the page count (from the scroll extent) and center the arrows on the card media band.
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const view = el.clientWidth
    if (view <= 0) return
    const pages = Math.max(1, Math.ceil((el.scrollWidth - view) / view) + 1)
    setPageCount(pages)
    setPage(Math.min(pages - 1, pageFromScroll(el)))
    const media = el.querySelector<HTMLElement>('[data-testid="card-media"]')
    const viewport = el.parentElement
    // 12px = the track's top padding; center on the media so the chevrons sit over the artwork.
    if (viewport) viewport.style.setProperty('--ov-arrow-top', `${12 + (media ? media.offsetHeight : 150) / 2}px`)
  }, [])

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el) return
    const onScroll = () => setPage(pageFromScroll(el))
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
      // Clamp to the real scroll extent rather than letting the browser do it silently: the last page's
      // nominal offset overshoots, and an overshoot is what put the resting position out of step with
      // `pageFromScroll` in the first place.
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth)
      el.scrollTo({ left: Math.min(target * el.clientWidth, maxScroll), behavior: 'smooth' })
    },
    [pageCount]
  )

  const showControls = !loading && pageCount > 1

  return (
    <S.Carousel>
      <Row.Head>
        <Row.Title>{title}</Row.Title>
        {viewAllTo ? (
          <Row.ViewAll to={viewAllTo}>
            {t('overview.viewAll')} <Icon name="view-all-arrow" size={18} />
          </Row.ViewAll>
        ) : null}
      </Row.Head>
      <S.Viewport>
        {showControls ? (
          <S.Arrow
            data-side="left"
            onClick={() => scrollToPage(page - 1)}
            disabled={page <= 0}
            aria-label={t('overview.previous')}
          >
            <img src={carouselArrow} alt="" aria-hidden />
          </S.Arrow>
        ) : null}
        <S.Track ref={trackRef}>{children}</S.Track>
        {showControls ? (
          <S.Arrow
            data-side="right"
            onClick={() => scrollToPage(page + 1)}
            disabled={page >= pageCount - 1}
            aria-label={t('overview.next')}
          >
            <img src={carouselArrow} alt="" aria-hidden />
          </S.Arrow>
        ) : null}
      </S.Viewport>
      {showControls ? (
        <S.Dots aria-label={t('overview.carouselPages', { title })}>
          {Array.from({ length: pageCount }).map((_, i) => (
            <S.Dot
              key={i}
              data-active={i === page || undefined}
              onClick={() => scrollToPage(i)}
              aria-label={t('overview.goToPage', { page: i + 1 })}
              aria-current={i === page ? 'true' : undefined}
            />
          ))}
        </S.Dots>
      ) : null}
    </S.Carousel>
  )
}
