import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OutfitCard } from '~/components/OutfitCard'
import { SkeletonOutfitCards, SkeletonSettle } from '~/components/SkeletonCards'
import { useOutfitItems, useOutfits } from '~/hooks/useOutfits'
import { isListingUnavailable, isOutfitsAvailable, outfitItemKey, type Outfit } from '~/lib/outfits'
import { railPageCount, railPageFromScroll } from '~/lib/pagedRail'
import { t } from '~/intl/i18n'
import carouselArrow from '~/assets/icons/carousel-arrow.svg'
import * as Row from '~/styles/row.styles'
import * as S from './OutfitsRow.styles'

const MAX_DOTS = 6

// Placeholders while the published outfits load — one per card the widest tier shows (5), so the rail is
// full at every breakpoint (the narrower tiers just scroll the extras out of view).
const SKELETON_COUNT = 5

// "Shop the look" — curated outfits on the overview. Self-fetching discovery row: renders nothing
// until published outfits exist (and nothing at all when no shop-server is configured). One merged
// catalog resolution covers every card — never one request per card.
export function OutfitsRow() {
  const { data: outfits = [], isLoading } = useOutfits()
  const resolution = useOutfitItems(outfits)

  const trackRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(0)

  // Only outfits whose EVERY item still resolves and carries a price survive (the rest stay
  // reachable at /outfits/:id) — so a card on this row never voices a partial state and its CTA
  // always reads "Add to cart". While resolving — or when the catalog is DOWN — every outfit stays
  // visible and the cards degrade instead (skeleton total / no CTA): an outage must not empty the row.
  //
  // This is a DISPLAY filter, and it is as sharp as the /v2 catalog it reads: that feed reports
  // delisting but not remaining supply, so a minted-out primary still looks alive here. The CTA does
  // not trust it — it re-reads every item from the shop feed before anything becomes a cart line, and
  // reports whatever died in between through the partial-add toast (see useOutfitCart).
  const visible = useMemo(() => {
    if (resolution.isLoading || resolution.isError) return outfits
    return outfits.filter((outfit: Outfit) =>
      outfit.items.every(ref => {
        const item = resolution.byKey.get(outfitItemKey(ref))
        return !!item && !isListingUnavailable(item)
      })
    )
  }, [outfits, resolution])

  // Same paging model as the Overview carousels: a page is one viewport-width of scroll, so the
  // arrows and dots stay honest across the responsive N-per-view tiers.
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    if (el.clientWidth <= 0) return
    const pages = railPageCount(el.scrollWidth, el.clientWidth)
    setPageCount(pages)
    setPage(current => Math.min(pages - 1, current))
  }, [])

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el) return
    const onScroll = () => setPage(railPageFromScroll(el.scrollLeft, el.scrollWidth, el.clientWidth))
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
    }
  }, [measure, visible.length])

  const scrollToPage = useCallback(
    (target: number) => {
      const el = trackRef.current
      if (!el) return
      const clamped = Math.max(0, Math.min(pageCount - 1, target))
      el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' })
    },
    [pageCount]
  )

  // Nothing to hold space for when the feature is dark (no shop-server) or when the row has settled on
  // no showable look — the section does not exist in either case. But it DOES exist while the outfits are
  // in flight, and returning null there is what made the whole "Shop the look" section materialise late
  // and drop everything under it by a card's height (472px desktop, 605px at 375px). So the loading state
  // renders the row's own shell with outfit-shaped placeholders instead.
  if (!isOutfitsAvailable() || (!isLoading && visible.length === 0)) return null

  const title = t('outfits.rowTitle')

  // Never more than 6 dots however many pages there are (one look per page on phones would
  // otherwise overflow the dots row); past 6 they become a coarse, proportionally-mapped control.
  const dotCount = Math.min(pageCount, MAX_DOTS)
  const activeDot = pageCount <= 1 ? 0 : Math.round((page / (pageCount - 1)) * (dotCount - 1))
  const dotPage = (dot: number) => (dotCount <= 1 ? 0 : Math.round((dot / (dotCount - 1)) * (pageCount - 1)))
  // Arrows and dots belong to a rail that HAS pages, and a loading rail's page count is a count of
  // placeholders — so they stay off until the looks are real (the strip below still holds their height).
  const showControls = !isLoading && pageCount > 1

  return (
    <Row.Root data-testid="outfits-row">
      <Row.Head>
        <Row.Title>{title}</Row.Title>
      </Row.Head>
      <S.Viewport>
        {showControls ? (
          <Row.Arrow
            data-side="left"
            data-testid="outfits-row-prev"
            onClick={() => scrollToPage(page - 1)}
            disabled={page <= 0}
            aria-label={t('overview.previous')}
          >
            <img src={carouselArrow} alt="" aria-hidden />
          </Row.Arrow>
        ) : null}
        <S.Track ref={trackRef} data-testid="outfits-row-track">
          {isLoading ? (
            <SkeletonOutfitCards count={SKELETON_COUNT} />
          ) : (
            visible.map(outfit => <OutfitCard key={outfit.id} outfit={outfit} resolution={resolution} />)
          )}
        </S.Track>
        {/* The placeholders' exit, crossfaded over the looks that replaced them (see SkeletonSettle). */}
        <SkeletonSettle loading={isLoading}>
          <S.Track>
            <SkeletonOutfitCards count={SKELETON_COUNT} settling />
          </S.Track>
        </SkeletonSettle>
        {showControls ? (
          <Row.Arrow
            data-side="right"
            data-testid="outfits-row-next"
            onClick={() => scrollToPage(page + 1)}
            disabled={page >= pageCount - 1}
            aria-label={t('overview.next')}
          >
            <img src={carouselArrow} alt="" aria-hidden />
          </Row.Arrow>
        ) : null}
      </S.Viewport>
      {/* Reserved even with nothing to page — the 24px this strip occupies is 24px the whole page below
          moved by when it appeared with the looks. Same reservation as the Overview carousels. */}
      {showControls ? (
        <Row.Dots data-testid="outfits-row-dots" aria-label={t('overview.carouselPages', { title })}>
          {Array.from({ length: dotCount }).map((_, i) => (
            <Row.Dot
              key={i}
              data-active={i === activeDot || undefined}
              onClick={() => scrollToPage(dotPage(i))}
              aria-label={t('overview.goToPage', { page: dotPage(i) + 1 })}
              aria-current={i === activeDot ? 'true' : undefined}
            />
          ))}
        </Row.Dots>
      ) : (
        <Row.Dots aria-hidden data-testid="rail-dots-reserved" />
      )}
    </Row.Root>
  )
}

export default OutfitsRow
