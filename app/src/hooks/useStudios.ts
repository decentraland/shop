import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { Session } from '~/lib/auth'
import { getMyStudio, getMyStudios } from '~/lib/studio'

const GIFTS_PAGE_SIZE = 25

/** The studios the signed-in account acts for. Empty for an account that acts for none. */
export function useMyStudios(session: Session | null) {
  return useQuery({
    queryKey: ['my-studios', session?.address],
    enabled: !!session,
    queryFn: () => getMyStudios(session!.identity)
  })
}

/**
 * Where the next page of gifts starts, or undefined when there is none. An empty page ends the list even if the
 * total says more: asking again from the same offset would only get the same empty page.
 */
export function nextGiftsOffset(last: { gifts: unknown[]; total: number }, pages: Array<{ gifts: unknown[] }>) {
  if (last.gifts.length === 0) return undefined
  const loaded = pages.reduce((sum, page) => sum + page.gifts.length, 0)
  return loaded < last.total ? loaded : undefined
}

/** One of the account's studios with its gifts, newest first, a page at a time. */
export function useMyStudio(session: Session | null, studioId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['my-studio', session?.address, studioId],
    enabled: !!session && !!studioId,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getMyStudio(studioId!, session!.identity, { limit: GIFTS_PAGE_SIZE, offset: pageParam }),
    getNextPageParam: nextGiftsOffset
  })
}
