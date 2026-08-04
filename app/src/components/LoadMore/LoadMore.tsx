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
  onLoadMore,
  auto = true
}: {
  hasNextPage: boolean
  isFetching: boolean
  onLoadMore: () => void
  /** false = explicit button only, no scroll trigger — for grids with content below them
      (e.g. the studio picker, where auto-loading would keep pushing the save bar away). */
  auto?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !hasNextPage || !auto) return
    const io = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && !isFetching) onLoadMore()
      },
      { rootMargin: '600px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetching, onLoadMore, auto])

  if (!hasNextPage) return null

  return (
    <S.Root ref={ref}>
      <S.Trigger variant="ghost" onClick={onLoadMore} disabled={isFetching}>
        {isFetching ? t('loadMore.loading') : t('loadMore.loadMore')}
      </S.Trigger>
    </S.Root>
  )
}
