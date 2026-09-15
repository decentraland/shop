import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { AssetCard } from '~/components/AssetCard'
import { useSuggestedForYou } from '~/hooks/useSuggestedForYou'
import { fetchCatalogByIds, type SuggestedItem } from '~/lib/api'
import { track } from '~/lib/analytics'
import { reasonCounts, type ClickTarget, type HiddenReason, type PagedAction } from '~/lib/suggestionEvents'
import { railGeometry, railPageFromGeometry, scrollRailToPage } from '~/lib/pagedRail'
import { reasonInterpolatesItemName, reasonKey, reasonLinksToItem, triggerItemPath } from '~/lib/suggestionReasons'
import { t } from '~/intl/i18n'
import carouselArrow from '~/assets/icons/carousel-arrow.svg'
import { useQuery } from '@tanstack/react-query'
import * as Row from '~/styles/row.styles'
import * as S from './SuggestedForYouRow.styles'

const RAIL_SIZE = 12

/**
 * Below this the rail is not worth the space it takes: a personalised row with two cards reads as a
 * bug rather than a recommendation, and the server already tells us when it had nothing personal to
 * work with.
 */
const MIN_ROWS = 4

/**
 * "Suggested for you" — the personalised rail on the home page.
 *
 * Self-fetching and self-hiding, like the Trending row it sits under: it disappears entirely unless
 * the server both personalised the answer and returned enough of it. That is deliberate — a rail
 * under this title showing generic bestsellers is worse than no rail, because it makes a promise
 * about knowing the visitor that the contents do not keep.
 *
 * Each card carries one line saying why it is there. When the reason names an item the visitor
 * already has, the name is resolved for the whole rail in a single catalog request, never one per
 * card, and the line degrades to the generic copy if that request fails.
 */
export function SuggestedForYouRow() {
  const { result, isLoading, isError, enabled, hasSignal, hasAddress, seedCount, fetchMs } =
    useSuggestedForYou(RAIL_SIZE)
  const items = useMemo(() => result?.data ?? [], [result])

  // Names are needed only by the one kind whose copy has a name in it; the rest link to their
  // trigger using the id they already carry. So a rail with no "because you have X" rows makes no
  // request at all, and one that has them makes exactly one.
  const triggerIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of items) {
      if (item.reason.itemId && reasonInterpolatesItemName(item.reason.kind)) ids.add(item.reason.itemId)
    }
    return [...ids]
  }, [items])

  const { data: triggers } = useQuery({
    queryKey: ['suggested-triggers', triggerIds.join(',')],
    enabled: triggerIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchCatalogByIds(triggerIds)
  })

  const triggerNameById = useMemo(() => {
    const byId = new Map<string, string>()
    for (const item of triggers ?? []) {
      if (!item.contractAddress || !item.itemId) continue
      byId.set(`${item.contractAddress.toLowerCase()}-${item.itemId}`, item.name)
    }
    return byId
  }, [triggers])

  const trackRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)
  const [page, setPage] = useState(0)

  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const g = railGeometry(el)
    if (!g) return
    setPageCount(g.pageCount)
    setPage(railPageFromGeometry(el, g))
  }, [])

  useEffect(() => {
    measure()
    const el = trackRef.current
    if (!el) return
    // One read per frame: railGeometry reads offsetLeft, so an unthrottled handler forces a
    // synchronous reflow on every scroll event.
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const g = railGeometry(el)
        if (g) setPage(railPageFromGeometry(el, g))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
    }
  }, [measure, items.length])

  const scrollToPage = useCallback((target: number) => {
    const el = trackRef.current
    if (!el) return
    const g = railGeometry(el)
    if (g) scrollRailToPage(el, g, target)
  }, [])

  // Why the rail is not here, or null when it is. Ordered the way the decision is actually made, so
  // the reported reason is the FIRST thing that stopped it rather than a later symptom: a rail that
  // never asked cannot also be "not personalized".
  const hiddenReason: HiddenReason | null = !enabled
    ? 'flag_off'
    : !hasSignal
      ? 'no_signal'
      : isLoading
        ? null
        : isError
          ? 'error'
          : result?.personalized !== true
            ? 'not_personalized'
            : items.length < MIN_ROWS
              ? 'too_few'
              : null

  const visible = !isLoading && hiddenReason === null

  // One per home-page visit, whichever way it went. Impressions alone cannot produce a click-through
  // rate: without knowing how often the rail was absent, and why, the denominator is unknowable.
  const reported = useRef(false)
  useEffect(() => {
    if (isLoading || reported.current || hiddenReason === null) return
    reported.current = true
    track('hidden_suggestions', {
      reason: hiddenReason,
      count: result?.data.length,
      has_address: hasAddress,
      seed_count: seedCount,
      algorithm: result?.algorithm
    })
  }, [isLoading, hiddenReason, result, hasAddress, seedCount])

  // The impression, fired when half the rail is actually ON SCREEN rather than when it mounts. The
  // row lives below the fold, so mounting says almost nothing about being seen, and a click-through
  // rate built on mounts flatters every rail equally.
  const railRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!visible || reported.current) return
    const el = railRef.current
    if (!el) return

    const report = () => {
      if (reported.current) return
      reported.current = true
      track('viewed_suggestions', {
        count: items.length,
        personalized: result?.personalized === true,
        algorithm: result?.algorithm,
        has_address: hasAddress,
        seed_count: seedCount,
        reason_counts: reasonCounts(items),
        fetch_ms: fetchMs
      })
    }

    // jsdom has no IntersectionObserver, and neither do a few older browsers. Reporting on mount
    // there overstates impressions, which is the safer of the two errors: the alternative is a rail
    // that silently reports nothing at all.
    if (typeof IntersectionObserver === 'undefined') {
      report()
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          report()
          observer.disconnect()
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible, items, result, hasAddress, seedCount, fetchMs])

  // Nothing at all until the answer is in and passes every condition — deliberately no skeleton.
  // Most first-time visits end with this rail absent, so a placeholder rail would mean a title and
  // five grey cards flashing in and then vanishing for the majority. The trade is a layout shift for
  // the few who do get the rail against a flash for everyone who does not, and the flash is worse.
  if (!visible) return null

  const showControls = pageCount > 1

  const onClick = (item: SuggestedItem, rank: number, target: ClickTarget) => {
    track('clicked_suggestion', {
      contract_address: item.contractAddress,
      item_id: item.itemId,
      rank,
      reason: item.reason.kind,
      algorithm: result?.algorithm,
      has_address: hasAddress,
      target
    })
  }

  const onPaged = (action: PagedAction, target: number) => {
    track('paged_suggestions', { action, page: target, algorithm: result?.algorithm })
    scrollToPage(target)
  }

  return (
    <Row.Root ref={railRef} data-testid="suggested-row">
      <Row.Head>
        <Row.Title>{t('overview.suggested.title')}</Row.Title>
      </Row.Head>
      <S.Viewport>
        {showControls ? (
          <Row.Arrow
            data-side="left"
            data-testid="suggested-row-prev"
            onClick={() => onPaged('prev', page - 1)}
            disabled={page <= 0}
            aria-label={t('overview.previous')}
          >
            <img src={carouselArrow} alt="" aria-hidden />
          </Row.Arrow>
        ) : null}
        <S.Track ref={trackRef} data-testid="suggested-row-track">
          {items.map((item, i) => (
            <S.Cell key={item.id} onClick={() => onClick(item, i, 'card')}>
              <AssetCard item={item} source="suggested" position={i} />
              <ReasonLine
                item={item}
                triggerNameById={triggerNameById}
                // The line sits inside the cell's click area, so its own click has to stop there:
                // otherwise every reason click would also be counted as interest in the card.
                onReasonClick={event => {
                  event.stopPropagation()
                  onClick(item, i, 'reason')
                }}
              />
            </S.Cell>
          ))}
        </S.Track>
        {showControls ? (
          <Row.Arrow
            data-side="right"
            data-testid="suggested-row-next"
            onClick={() => onPaged('next', page + 1)}
            disabled={page >= pageCount - 1}
            aria-label={t('overview.next')}
          >
            <img src={carouselArrow} alt="" aria-hidden />
          </Row.Arrow>
        ) : null}
      </S.Viewport>
      {showControls ? (
        <Row.Dots aria-label={t('overview.carouselPages', { title: t('overview.suggested.title') })}>
          {Array.from({ length: pageCount }).map((_, i) => (
            <Row.Dot
              key={i}
              data-active={i === page || undefined}
              onClick={() => onPaged('dot', i)}
              aria-label={t('overview.goToPage', { page: i + 1 })}
              aria-current={i === page ? 'true' : undefined}
            />
          ))}
        </Row.Dots>
      ) : (
        <Row.Dots aria-hidden data-testid="suggested-rail-dots-reserved" />
      )}
    </Row.Root>
  )
}

/**
 * The one line under a card.
 *
 * Two independent questions decide what it renders: whether the copy needs a NAME (only "Because you
 * have X" does, and a name has to be fetched, so it may not have arrived), and whether the line
 * LINKS anywhere (every kind the server attached an item to, using the id it already carries). A
 * name that never arrives falls back to the generic copy rather than showing a gap or a raw id.
 */
function ReasonLine({
  item,
  triggerNameById,
  onReasonClick
}: {
  item: SuggestedItem
  triggerNameById: Map<string, string>
  onReasonClick: (event: MouseEvent<HTMLElement>) => void
}) {
  const { kind, itemId, creator } = item.reason
  const key = reasonKey(kind)
  if (!key) return null

  if (reasonInterpolatesItemName(kind)) {
    const name = itemId ? triggerNameById.get(itemId) : undefined
    if (!name) {
      // The name is the only part that failed; the row is still personal. Saying "Trending" here would
      // be a claim about the item that is simply untrue, so the fallback is the one line that is true
      // of every row in this rail and specific to none.
      return (
        <S.Reason data-testid="suggested-reason" data-kind="generic">
          {t('overview.suggested.reason.generic')}
        </S.Reason>
      )
    }
    return (
      <Line
        kind={kind}
        text={t(key, { item: name })}
        to={itemId ? triggerItemPath(itemId) : null}
        onReasonClick={onReasonClick}
      />
    )
  }

  // `creator` is passed though none of the current copy interpolates it (suggestionReasons.spec pins
  // that). It is here for the revision that names the creator, which would also need the resolution
  // path co_owned uses — the value alone is not enough to render a name.
  const to = reasonLinksToItem(kind) && itemId ? triggerItemPath(itemId) : null
  return <Line kind={kind} text={t(key, { creator: creator ?? '' })} to={to} onReasonClick={onReasonClick} />
}

/** The whole line is the link rather than a word inside it: the copy is one translated string, and
 * carving a component out of its middle would need every locale to place the name identically. */
function Line({
  kind,
  text,
  to,
  onReasonClick
}: {
  kind: string
  text: string
  to: string | null
  onReasonClick: (event: MouseEvent<HTMLElement>) => void
}) {
  return (
    <S.Reason data-testid="suggested-reason" data-kind={kind} title={text}>
      {to ? (
        <S.ReasonLink to={to} onClick={onReasonClick}>
          {text}
        </S.ReasonLink>
      ) : (
        text
      )}
    </S.Reason>
  )
}
