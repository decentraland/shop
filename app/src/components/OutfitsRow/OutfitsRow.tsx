import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OutfitCard } from '~/components/OutfitCard'
import { useOutfitItems, useOutfits } from '~/hooks/useOutfits'
import { isListingUnavailable, isOutfitsAvailable, outfitItemKey, type Outfit } from '~/lib/outfits'
import { t } from '~/intl/i18n'
import * as Row from '~/styles/row.styles'
import * as S from './OutfitsRow.styles'

const MAX_DOTS = 6

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
  // dots stay honest across the responsive N-per-view tiers.
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const view = el.clientWidth
    if (view <= 0) return
    const pages = Math.max(1, Math.ceil((el.scrollWidth - view) / view) + 1)
    setPageCount(pages)
    setPage(current => Math.min(pages - 1, current))
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

  if (!isOutfitsAvailable() || isLoading || visible.length === 0) return null

  const title = t('outfits.rowTitle')

  // Never more than 6 dots however many pages there are (one look per page on phones would
  // otherwise overflow the dots row); past 6 they become a coarse, proportionally-mapped control.
  const dotCount = Math.min(pageCount, MAX_DOTS)
  const activeDot = pageCount <= 1 ? 0 : Math.round((page / (pageCount - 1)) * (dotCount - 1))
  const dotPage = (dot: number) => (dotCount <= 1 ? 0 : Math.round((dot / (dotCount - 1)) * (pageCount - 1)))

  return (
    <Row.Root data-testid="outfits-row">
      <Row.Head>
        <Row.Title>{title}</Row.Title>
      </Row.Head>
      <S.Track ref={trackRef}>
        {visible.map(outfit => (
          <OutfitCard key={outfit.id} outfit={outfit} resolution={resolution} />
        ))}
      </S.Track>
      {pageCount > 1 ? (
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
      ) : null}
    </Row.Root>
  )
}

export default OutfitsRow
