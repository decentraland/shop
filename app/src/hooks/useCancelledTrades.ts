import { useMemo } from 'react'
import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query'
import {
  cancelledTradesKind,
  fetchCancelledTrades,
  type CancelledTrade,
  type CancelledTradesPage
} from '~/lib/cancelled-trades'
import { useCancelledListingsEnabled } from '~/hooks/useCancelledListingsEnabled'
import { useWallet } from '~/store/wallet'

const QUERY_KEY = 'cancelled-trades'

/** Refetch the taken-down list after the account re-creates a listing, so the re-created row drops out. */
export function invalidateCancelledTrades(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
}

export type CancelledTradesState = {
  trades: CancelledTrade[]
  /** Every taken-down trade, across all pages. `undefined` until known, so callers never flash a zero. */
  count: number | undefined
  kind: 'listings' | 'offers' | 'mixed' | undefined
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  fetchNextPage: () => void
}

/** The signed-in account's listings and offers taken down by the marketplace upgrade, paged, behind its flag. */
export function useCancelledTrades(): CancelledTradesState {
  const session = useWallet(s => s.session)
  const address = session?.address

  const enabled = useCancelledListingsEnabled()

  const query = useInfiniteQuery({
    queryKey: [QUERY_KEY, address],
    queryFn: ({ pageParam }) => fetchCancelledTrades(session!.identity, { skip: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: CancelledTradesPage, pages: CancelledTradesPage[]) => {
      // An empty page ends the list whatever `total` says, or the same offset would be asked for forever.
      if (lastPage.items.length === 0) return undefined
      const loaded = pages.reduce((n, page) => n + page.items.length, 0)
      return loaded < pages[0].total ? loaded : undefined
    },
    enabled: enabled && !!address,
    staleTime: 5 * 60_000
  })

  const pages = query.data?.pages
  // A row can shift onto the next page when one before it drops out server-side.
  const trades = useMemo(() => {
    const seen = new Set<string>()
    return (pages ?? []).flatMap(page => page.items).filter(trade => !seen.has(trade.id) && !!seen.add(trade.id))
  }, [pages])
  const count = pages?.[0]?.total
  const complete = !!pages && !query.hasNextPage

  // The banner's wording needs the offer count, which a partial first page cannot give.
  const { data: remoteOffers, isError: offersFailed } = useQuery({
    queryKey: [QUERY_KEY, address, 'offers-total'],
    queryFn: () => fetchCancelledTrades(session!.identity, { first: 1, types: ['bid'] }).then(page => page.total),
    enabled: !!pages && !complete && !!count,
    staleTime: 5 * 60_000
  })
  const offers = complete ? trades.filter(trade => trade.type === 'bid').length : remoteOffers
  let kind: CancelledTradesState['kind']
  if (count !== undefined && offers !== undefined) kind = cancelledTradesKind(count, offers)
  // Without the offer total, the wording that covers both.
  else if (count !== undefined && offersFailed) kind = 'mixed'

  return {
    trades,
    count,
    kind,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchNextPageError: query.isFetchNextPageError,
    fetchNextPage: () => void query.fetchNextPage()
  }
}
