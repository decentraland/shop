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
 * The rail's geometry, measured off the cards. A page of cards spans slightly less than the viewport, and
 * under mandatory snap only a card start is a scroll target the browser honours.
 */
type RailGeometry = { cards: HTMLElement[]; stride: number; perView: number; pageCount: number; base: number }

function railGeometry(el: HTMLElement): RailGeometry | null {
  // Narrowed rather than cast: `children` is typed as Element, and offsetLeft belongs to HTMLElement.
  const cards = Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement)
  if (cards.length === 0 || el.clientWidth <= 0) return null
  const stride = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : el.clientWidth
  if (stride <= 0) return null
  const perView = Math.max(1, Math.round(el.clientWidth / stride))
  return {
    cards,
    stride,
    perView,
    pageCount: Math.max(1, Math.ceil(cards.length / perView)),
    base: cards[0].offsetLeft
  }
}

/** Which page the rail is actually showing. */
function pageFromScroll(el: HTMLElement, g: RailGeometry): number {
  const maxScroll = el.scrollWidth - el.clientWidth
  if (maxScroll <= 0) return 0
  // The last page is partial, so the rail rests past its start; anchor the end or it never reads as
  // current. 2px of slack because scrollLeft is fractional and rounds off under zoom.
  if (el.scrollLeft >= maxScroll - 2) return g.pageCount - 1
  return Math.min(g.pageCount - 1, Math.round(el.scrollLeft / (g.perView * g.stride)))
}

export function CardCarousel({ title, count, loading = false, viewAllTo, children }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(0)

  // Recompute the page count (from the scroll extent) and center the arrows on the card media band.
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const g = railGeometry(el)
    if (!g) return
    setPageCount(g.pageCount)
    setPage(pageFromScroll(el, g))
    const media = el.querySelector<HTMLElement>('[data-testid="card-media"]')
    const viewport = el.parentElement
    // 12px = the track's top padding; center on the media so the chevrons sit over the artwork.
    if (viewport) viewport.style.setProperty('--ov-arrow-top', `${12 + (media ? media.offsetHeight : 150) / 2}px`)
  }, [])

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el) return
    // One read per frame: railGeometry reads offsetLeft, so an unthrottled handler forces a synchronous
    // reflow on every scroll event.
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const g = railGeometry(el)
        if (g) setPage(pageFromScroll(el, g))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
    }
  }, [measure, count])

  // Scroll to the start of a card, never to a multiple of the viewport width: under mandatory snap the
  // browser overrides any other target.
  const scrollToPage = useCallback((p: number) => {
    const el = trackRef.current
    if (!el) return
    const g = railGeometry(el)
    if (!g) return
    const target = Math.max(0, Math.min(g.pageCount - 1, p))
    const card = g.cards[Math.min(target * g.perView, g.cards.length - 1)]
    el.scrollTo({ left: card.offsetLeft - g.base, behavior: 'smooth' })
  }, [])

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
