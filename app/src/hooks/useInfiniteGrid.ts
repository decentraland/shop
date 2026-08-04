import { keepPreviousData, useInfiniteQuery, type QueryKey } from '@tanstack/react-query'

export type Page<T> = { items: T[]; total: number }

/**
 * Offset-paginated grid on top of react-query's useInfiniteQuery. `fetchPage(skip)` returns one page
 * (`{ items, total }`); pages accumulate by cumulative offset until `items.length` reaches `total`.
 * Returns the flattened `items`, the `total` (from the first page, for the count), and the
 * fetch-next controls the grid + <LoadMore/> need. `keepPreviousData` keeps the current results on
 * screen while a new filter/search set loads (no flash to skeletons on every tweak).
 */
export function useInfiniteGrid<T>(
  queryKey: QueryKey,
  fetchPage: (skip: number) => Promise<Page<T>>,
  opts: { enabled?: boolean } = {}
) {
  const query = useInfiniteQuery({
    queryKey,
    enabled: opts.enabled,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // An EMPTY page ends the list, whatever `total` claims. The offset is derived from how many items have
      // actually arrived, so a page that adds none leaves it unchanged — and returning the same pageParam
      // again means react-query appends another empty page, keeps `hasNextPage` true, and the grid requests
      // that identical offset forever. Today no endpoint can trigger it (they all report `total: 0` for an
      // over-the-end page, which stops the loop by accident), but "server-side filtering removed every row
      // from a page that is not the last" is a normal thing for a feed to do, and the sibling marketplace
      // shipped exactly this loop. Terminating on an empty page costs one page of pagination in that case
      // and cannot spin.
      if (lastPage.items.length === 0) return undefined
      const loaded = allPages.reduce((n, p) => n + p.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    placeholderData: keepPreviousData
  })

  const items = (query.data?.pages ?? []).flatMap(p => p.items)
  const total = query.data?.pages[0]?.total ?? 0

  return {
    items,
    total,
    isLoading: query.isLoading,
    // True while the CURRENT query key's data is still loading and react-query is showing the PREVIOUS
    // key's results as a placeholder (keepPreviousData). This is the "filter/search/sort just changed"
    // window — the grid should show skeletons here instead of the now-stale previous cards.
    isPlaceholderData: query.isPlaceholderData,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    // Whether the LAST next-page fetch failed. Distinct from `isError`, which a failed next page also sets
    // even though the pages already on screen are fine. <LoadMore/> needs it: after a failed page the auto
    // trigger must stand down and let the buyer retry by hand (see LoadMore.tsx).
    isFetchNextPageError: query.isFetchNextPageError,
    fetchNextPage: query.fetchNextPage
  }
}
