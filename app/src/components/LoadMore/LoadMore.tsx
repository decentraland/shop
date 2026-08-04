import { useEffect, useRef } from 'react'
import * as S from './LoadMore.styles'
import { t } from '~/intl/i18n'

/**
 * Infinite-scroll trigger for a paginated grid. Auto-loads the next page when the sentinel scrolls
 * into view (600px early, so it feels seamless) and also renders a real button as a keyboard/no-IO
 * fallback. Renders nothing once there's no next page. The grid itself shows the "loading more"
 * skeletons (so they land inside the grid layout) — see the pages that use this.
 */
export function LoadMore({
  hasNextPage,
  isFetching,
  isError = false,
  onLoadMore
}: {
  hasNextPage: boolean
  isFetching: boolean
  /**
   * Whether the last next-page fetch FAILED. Auto-loading stops until the buyer retries with the button
   * below — see the effect. Optional because the two client-side pagers (MyFavorites, Activity) have no
   * failing fetch to report.
   */
  isError?: boolean
  onLoadMore: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Every call site passes an inline arrow, so a new identity arrives on EVERY render of the host page —
  // and Assets re-renders on the MANA-rate poll alone, with no scrolling at all. Held in a ref so it stays
  // out of the deps below: re-running the effect disconnects the observer and builds a new one, and
  // `observe()` queues a fresh initial notification for a sentinel that is already intersecting. That is
  // what turned one intersection into a stream of them.
  const loadMore = useRef(onLoadMore)
  loadMore.current = onLoadMore

  useEffect(() => {
    const el = ref.current
    // Nothing to auto-load while a page is in flight — and nothing at all once one has FAILED. react-query
    // keeps the pages it already holds on a failed fetch, so `hasNextPage` stays true while
    // `isFetchingNextPage` drops back to false: the sentinel is then still in view with the guard released,
    // and the grid re-requested the same broken offset for as long as the tab stayed open (four attempts
    // with backoff per round, forever). After a failure the retry has to be deliberate, via the button.
    if (!el || !hasNextPage || isFetching || isError) return
    const io = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) loadMore.current()
      },
      { rootMargin: '600px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetching, isError])

  if (!hasNextPage) return null

  return (
    <S.Root ref={ref}>
      <S.Trigger variant="ghost" onClick={onLoadMore} disabled={isFetching}>
        {isFetching ? t('loadMore.loading') : isError ? t('loadMore.retry') : t('loadMore.loadMore')}
      </S.Trigger>
    </S.Root>
  )
}
