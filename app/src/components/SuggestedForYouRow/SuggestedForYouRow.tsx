import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssetCard } from '~/components/AssetCard'
import { Icon } from '~/components/Icon'
import { SkeletonCards, SkeletonSettle } from '~/components/SkeletonCards'
import { useSuggestedForYou } from '~/hooks/useSuggestedForYou'
import type { SuggestedItem } from '~/lib/api'
import { track } from '~/lib/analytics'
import {
  reasonCounts,
  suggestedHiddenReason,
  type ClickTarget,
  type PagedAction,
  type SuggestionSurface
} from '~/lib/suggestionEvents'
import { railGeometry, railPageFromGeometry, scrollRailToPage } from '~/lib/pagedRail'
import { explainedRows, reasonCategory, reasonCopyKey, type ReasonCategory } from '~/lib/suggestionReasons'
import { t } from '~/intl/i18n'
import carouselArrow from '~/assets/icons/carousel-arrow.svg'
import creatorIcon from '~/assets/suggested/creator.svg'
import favoritesIcon from '~/assets/suggested/favorites.svg'
import ownedIcon from '~/assets/suggested/owned.svg'
import * as Row from '~/styles/row.styles'
import * as S from './SuggestedForYouRow.styles'

const RAIL_SIZE = 12

// Enough to fill the widest viewport the rail is shown at; the track clips the rest.
const SKELETON_COUNT = 6

/**
 * Below this the rail is not worth the space it takes: a personalised row with two cards reads as a
 * bug rather than a recommendation, and the server already tells us when it had nothing personal to
 * work with.
 */

/**
 * "Suggested for you" — the personalised rail on the home page.
 *
 * Self-fetching and self-hiding, like the Trending row it sits under: it disappears entirely unless
 * the server both personalised the answer and returned enough of it. That is deliberate — a rail
 * under this title showing generic bestsellers is worse than no rail, because it makes a promise
 * about knowing the visitor that the contents do not keep.
 *
 * Each card says, inside the card, which of four things it was picked from. A row the server could
 * only explain as trending is left out: every card in a personal rail says why.
 */
/**
 * @param exclude items the rail must not offer — the PDP's own anchor, which it would otherwise
 *   recommend back to the reader of that very page.
 * @param title overrides the home page's wording. On a PDP the rail answers a narrower question, and
 *   "Suggested for you" over a row that deliberately excludes the item you are looking at reads as a
 *   non sequitur.
 * @param surface which page this is, so the analytics can tell the rails apart.
 * @param first how many rows to ask for. A prop and not a constant because a caller that ALSO calls the
 *   hook -- the PDP does, to decide whether its own cascade is still wanted -- has to ask the identical
 *   question, or react-query sees two keys and the Shop pays twice for its most expensive request. The
 *   e2e asserts one request per page for exactly this reason.
 */
export function SuggestedForYouRow({
  exclude,
  title,
  surface = 'home',
  first = RAIL_SIZE
}: { exclude?: string[]; title?: string; surface?: SuggestionSurface; first?: number } = {}) {
  const { result, isLoading, isError, enabled, hasSignal, hasAddress, seedCount, fetchMs } = useSuggestedForYou(first, {
    exclude
  })
  const items = useMemo(() => explainedRows(result?.data ?? []), [result])

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
  const hiddenReason = suggestedHiddenReason({
    enabled,
    hasSignal,
    isLoading,
    isError,
    personalized: result?.personalized,
    rowCount: items.length
  })

  const visible = !isLoading && hiddenReason === null

  // One per home-page visit, whichever way it went. Impressions alone cannot produce a click-through
  // rate: without knowing how often the rail was absent, and why, the denominator is unknowable.
  const reported = useRef(false)
  useEffect(() => {
    if (isLoading || reported.current || hiddenReason === null) return
    reported.current = true
    track('hidden_suggestions', {
      reason: hiddenReason,
      count: items.length,
      has_address: hasAddress,
      seed_count: seedCount,
      algorithm: result?.algorithm,
      surface
    })
  }, [isLoading, hiddenReason, result, items.length, hasAddress, seedCount, surface])

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
        fetch_ms: fetchMs,
        surface
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
  }, [visible, items, result, hasAddress, seedCount, fetchMs, surface])

  // Placeholders only while a request is actually IN FLIGHT — which is to say only for someone who has
  // the flag and something to personalise from. A visitor with neither never asked, so they never see a
  // rail shimmer in and vanish; what the placeholders buy is that the page stops jumping when the answer
  // lands for everyone who did ask.
  //
  // Still a trade rather than a free win: a caller who asks and is hidden anyway (the server had nothing
  // personal, or returned too few rows) sees the placeholders collapse. `hidden_suggestions` already
  // reports that case with its reason, so how often it happens will be a number rather than a guess.
  //
  // Note this is one tree, not an early return: SkeletonSettle has to be MOUNTED while loading to notice
  // the edge when loading goes false, and an early return would mount it afterwards, when there is
  // nothing left for it to fade.
  if (!isLoading && !visible) return null

  // Never over the placeholders: the arrows are measured from a track that currently holds skeletons, and
  // a click on one would report a `paged_suggestions` for a rail the reader cannot see yet.
  const showControls = !isLoading && pageCount > 1

  const onClick = (item: SuggestedItem, rank: number) => {
    track('clicked_suggestion', {
      contract_address: item.contractAddress,
      item_id: item.itemId,
      rank,
      reason: item.reason.kind,
      algorithm: result?.algorithm,
      has_address: hasAddress,
      surface,
      target: 'card' satisfies ClickTarget
    })
  }

  const onPaged = (action: PagedAction, target: number) => {
    track('paged_suggestions', { action, page: target, algorithm: result?.algorithm, surface })
    scrollToPage(target)
  }

  const skeletonCells = Array.from({ length: SKELETON_COUNT }).map((_, i) => (
    <S.Cell key={i}>
      <SkeletonCards count={1} settling={!isLoading} />
      <S.ReasonPlaceholder aria-hidden />
    </S.Cell>
  ))

  return (
    <Row.Root ref={railRef} data-testid={isLoading ? 'suggested-row-skeleton' : 'suggested-row'}>
      <Row.Head>
        <Row.Title>{title ?? t('overview.suggested.title')}</Row.Title>
      </Row.Head>
      <S.Viewport>
        {/* The placeholders' exit, crossfaded over the cards that replaced them (see SkeletonSettle). */}
        <SkeletonSettle loading={isLoading}>
          <S.Track>{skeletonCells}</S.Track>
        </SkeletonSettle>
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
          {isLoading && skeletonCells}
          {!isLoading &&
            items.map((item, i) => (
              <S.Cell key={item.id} onClick={() => onClick(item, i)}>
                <AssetCard item={item} source="suggested" position={i} note={noteFor(item)} />
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

const REASON_ICONS: Record<Exclude<ReasonCategory, 'activity'>, string> = {
  owned: ownedIcon,
  favorites: favoritesIcon,
  creator: creatorIcon
}

/** The card's note: its category's icon and copy, or nothing for a row with no category. */
function noteFor(item: SuggestedItem) {
  const category = reasonCategory(item.reason.kind)
  return category ? <ReasonNote category={category} /> : undefined
}

function ReasonNote({ category }: { category: ReasonCategory }) {
  const text = t(reasonCopyKey(category))
  return (
    <>
      <S.ReasonIcon data-category={category} aria-hidden>
        {category === 'activity' ? <Icon name="eye" size={16} /> : <img src={REASON_ICONS[category]} alt="" />}
      </S.ReasonIcon>
      <S.ReasonText data-testid="suggested-reason" data-kind={category} title={text}>
        {text}
      </S.ReasonText>
    </>
  )
}
