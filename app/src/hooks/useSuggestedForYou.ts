import { useMemo, useRef } from 'react'
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
  isError: boolean
  /** Whether the flag lets the rail ask at all — one of the reasons it may be absent. */
  enabled: boolean
  /** Whether there was anything to personalise from; false means no request was made. */
  hasSignal: boolean
  hasAddress: boolean
  seedCount: number
  /** How long the request took, for the rail's own latency reporting. Undefined until it resolves. */
  fetchMs?: number
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

  // Wearables first, then the emote wheel: both are "what this avatar wears right now", and the cap is
  // shared, so the order decides what survives it. Wearables lead because a full outfit is a broader
  // statement of taste than ten emote slots, but the emotes have to be here at all — they are the only
  // signal the profile carries about emotes, which wearables can never stand in for.
  const equipped = useMemo(() => {
    const wearables = profile?.avatar?.wearables ?? []
    const emotes = (profile?.avatar?.emotes ?? []).map(slot => slot.urn).filter(Boolean)
    return [...wearables, ...emotes].slice(0, MAX_EQUIPPED)
  }, [profile])

  const hasSignal = !!address || seeds.length > 0
  const key = seedsKey(seeds)

  // Measured around the fetch itself rather than around the query, so a cached answer reports no
  // time instead of reporting zero as if it had been fetched instantly.
  const fetchMs = useRef<number | undefined>(undefined)

  const { data, isLoading, isError } = useQuery({
    // Everything that changes the answer, and nothing that does not: the seed KEY rather than the
    // array, so a re-derived list in a different order does not look like new input.
    //
    // `equipped` is deliberately absent even though it is sent. Swapping one wearable is not worth
    // discarding a still-fresh set of recommendations, and the profile's arrival already moves the key
    // through `bodyShape`, so the first fetch never misses it; a later change is picked up by the next
    // fetch after staleTime.
    queryKey: ['suggested-for-you', address ?? 'anon', key, bodyShape ?? '', first],
    enabled: enabled && hasSignal,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const started = performance.now()
      const answer = await fetchSuggestedItems({ address, seeds, bodyShape, equipped, first })
      fetchMs.current = Math.round(performance.now() - started)
      return answer
    }
  })

  return {
    result: data,
    isLoading: enabled && hasSignal && isLoading,
    isError,
    enabled,
    hasSignal,
    hasAddress: !!address,
    seedCount: seeds.length,
    fetchMs: fetchMs.current
  }
}
