import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useProfile } from '~/hooks/useProfile'
import { useSuggestedForYouEnabled } from '~/hooks/useSuggestedForYouEnabled'
import { fetchSuggestedItems, type SuggestedItemsResult } from '~/lib/api'
import { avatarShape } from '~/lib/bodyShape'
import { getRecentlyViewed } from '~/lib/recently-viewed'
import { buildSuggestionSeeds, seedsKey } from '~/lib/suggestionSeeds'
import { useCart } from '~/store/cart'
import { useFavorites } from '~/store/favorites'
import { useWallet } from '~/store/wallet'

/** Equipped wearables and emote slots the Catalyst profile reports, capped the way the server caps them. */
const MAX_EQUIPPED = 30

export type SuggestedForYou = {
  result?: SuggestedItemsResult
  isLoading: boolean
}

/**
 * The personalised rail's data.
 *
 * Everything it knows about the visitor is gathered here and sent in one request: who they are when
 * signed in, what their avatar is wearing, and — for someone who is not signed in at all — what this
 * browser has shown interest in. That last part is why the row can personalise for a first-time
 * visitor who has never bought anything, which is most of the Shop's audience.
 *
 * The request is never made with nothing to say: no account and no seeds means the server could only
 * answer with the trending fallback, which the home page already has a row for.
 */
export function useSuggestedForYou(first = 12): SuggestedForYou {
  const enabled = useSuggestedForYouEnabled()
  const address = useWallet(s => s.session?.address)
  const { data: profile } = useProfile(address)

  const cartItems = useCart(s => s.items)
  const favoriteItems = useFavorites(s => s.items)

  const seeds = useMemo(
    () =>
      buildSuggestionSeeds({
        cart: cartItems,
        favorites: Object.values(favoriteItems),
        recentlyViewed: getRecentlyViewed()
      }),
    [cartItems, favoriteItems]
  )

  const bodyShape = useMemo(() => {
    const shape = avatarShape(profile)
    if (!shape) return undefined
    return shape.includes('BaseFemale') ? 'BaseFemale' : 'BaseMale'
  }, [profile])

  const equipped = useMemo(() => (profile?.avatar?.wearables ?? []).slice(0, MAX_EQUIPPED), [profile])

  const hasSignal = !!address || seeds.length > 0
  const key = seedsKey(seeds)

  const { data, isLoading } = useQuery({
    // Everything that changes the answer, and nothing that does not: the seed KEY rather than the
    // array, so a re-derived list in a different order does not look like new input.
    queryKey: ['suggested-for-you', address ?? 'anon', key, bodyShape ?? '', first],
    enabled: enabled && hasSignal,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: () => fetchSuggestedItems({ address, seeds, bodyShape, equipped, first })
  })

  return { result: data, isLoading: enabled && hasSignal && isLoading }
}
