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
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage
  }
}
