import { useQuery } from '@tanstack/react-query'

import type { CatalogItem } from '~/lib/api'
import { favoriteKey, fetchFavoriteStats } from '~/lib/favorites'
import { useFavorites } from '~/store/favorites'
import { useWallet } from '~/store/wallet'

/**
 * How many people have saved an item, the number the marketplace shows beside its bookmark.
 *
 * `undefined` until the answer is known, and on error, so a caller renders nothing rather than a
 * misleading zero. The viewer's own heart is applied on top of the server's number: the toggle is
 * optimistic and its POST does not refresh this read, so without the ±1 the count would sit still
 * while the heart it sits next to has already changed. Signed out the save is local-only and the
 * service cannot know about it — it is still counted here, because the number has to agree with that
 * heart either way.
 */
export function useFavoriteCount(item: Pick<CatalogItem, 'contractAddress' | 'itemId'>): number | undefined {
  const key = favoriteKey(item)
  const address = useWallet(s => s.session?.address)
  const identity = useWallet(s => s.session?.identity)
  const faved = useFavorites(s => !!key && !!s.items[key])
  // A signed-in hydrate empties the list before refilling it from the service, so mid-hydrate every
  // item reads as unsaved.
  const favoritesHydrating = useFavorites(s => s.status === 'loading')

  const { data } = useQuery({
    queryKey: ['favorite-count', key, address ?? null],
    queryFn: () => {
      // `enabled` already keeps this from running without a key; the guard is what keeps the two in step,
      // and it is what lets the call stay free of a cast.
      if (!key) throw new Error('favorite count asked for without an item key')
      return fetchFavoriteStats(key, identity)
    },
    enabled: !!key,
    // Saves accumulate slowly and the viewer's own is already applied below, so re-reading this per
    // mount buys nothing.
    staleTime: 5 * 60_000
  })

  if (!data) return undefined
  // `faved` is not yet trustworthy while the list hydrates: adjusting by it would take the viewer's own
  // save off a number the service is right about, and show it back a moment later.
  if (favoritesHydrating || faved === data.pickedByUser) return data.count
  return Math.max(0, data.count + (faved ? 1 : -1))
}
