import { useMemo } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'

import { track } from '~/lib/analytics'
import { fetchCatalogByIds, type CatalogItem } from '~/lib/api'
import { FeatureFlag, getAddressListVariant, getIsFeatureEnabled } from '~/lib/featureFlags'
import {
  fetchOutfits,
  isOutfitsAvailable,
  outfitItemKey,
  splitOutfitItems,
  type Outfit,
  type OutfitItemsSplit
} from '~/lib/outfits'
import { t } from '~/intl/i18n'
import { useCart } from '~/store/cart'
import { toast } from '~/store/toast'
import { useWallet } from '~/store/wallet'

/** Published outfits for the public surfaces. Disabled entirely when no shop-server is configured. */
export function useOutfits() {
  return useQuery({
    queryKey: ['outfits'],
    queryFn: fetchOutfits,
    enabled: isOutfitsAvailable(),
    staleTime: 60_000
  })
}

export type OutfitItemsResolution = {
  /** Resolved live items keyed by `contract-itemId`. */
  byKey: Map<string, CatalogItem>
  /** Keys the catalog no longer returns — delisted, i.e. "no longer available". */
  missing: Set<string>
  /** True while the catalog request is in flight. */
  isLoading: boolean
  /** True when the catalog request FAILED — an outage, not a sell-out; render a retry, never "unavailable". */
  isError: boolean
  retry: () => void
}

/** Anything holding outfit item refs — a full record or the studio's unsaved draft. */
type OutfitLike = Pick<Outfit, 'items'>

/**
 * One merged catalog resolution for any number of outfits (a carousel resolves all its cards with
 * a single request instead of one per card). Keys resolve through fetchCatalogByIds, whose v2
 * catalog ids ARE the `contract-itemId` pairs outfits store.
 */
export function useOutfitItems(outfits: OutfitLike[] | OutfitLike | undefined): OutfitItemsResolution {
  const list = useMemo(() => (Array.isArray(outfits) ? outfits : outfits ? [outfits] : []), [outfits])
  const keys = useMemo(() => {
    const unique = new Set(list.flatMap(outfit => outfit.items.map(outfitItemKey)))
    return [...unique].sort()
  }, [list])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['outfit-items', keys],
    queryFn: () => fetchCatalogByIds(keys),
    enabled: keys.length > 0,
    staleTime: 60_000
  })

  return useMemo(() => {
    const byKey = new Map((data ?? []).map(item => [item.id, item]))
    const missing = new Set(data ? keys.filter(key => !byKey.has(key)) : [])
    return {
      byKey,
      missing,
      isLoading: keys.length > 0 && isLoading,
      isError,
      retry: () => void refetch()
    }
  }, [data, keys, isLoading, isError, refetch])
}

export type OutfitCart = {
  /** The outfit's resolved items grouped by what the CTA can do with them. */
  split: OutfitItemsSplit
  /** Items the catalog no longer returns (counted as unavailable in the toast/analytics). */
  missingCount: number
  /** Buyable now or already in the cart — the honest "N of M available" numerator. */
  availableCount: number
  /** Credits the CTA would add (purchasable items only — matches its label). */
  totalCredits: number
  addOutfit: () => void
}

/**
 * The shared add-outfit-to-cart behavior for the card and the detail page: filter-and-skip (never
 * quantity bumps — two outfits sharing a shirt yield one shirt), one outfit-level analytics event
 * with the skip-reason breakdown on top of the per-item `source: 'outfit'` events, and an honest
 * toast when anything was skipped.
 */
export function useOutfitCart(outfit: Outfit, resolution: OutfitItemsResolution): OutfitCart {
  const add = useCart(s => s.add)
  const cartIds = useCart(s => s.items.map(i => i.id))
  const address = useWallet(s => s.session?.address)

  const resolved = useMemo(
    () =>
      outfit.items.map(ref => resolution.byKey.get(outfitItemKey(ref))).filter((item): item is CatalogItem => !!item),
    [outfit, resolution.byKey]
  )
  const split = useMemo(
    () => splitOutfitItems(resolved, { address, cartIds: new Set(cartIds) }),
    [resolved, address, cartIds]
  )
  const missingCount = outfit.items.length - resolved.length
  const totalCredits = split.purchasable.reduce((n, item) => n + item.priceCredits, 0)

  function addOutfit() {
    const added = split.purchasable.length
    if (added === 0) return
    split.purchasable.forEach(item => add(item, 'outfit'))

    const unavailable = split.unavailable.length + missingCount
    track('Shop Outfit Added To Cart', {
      outfit_id: outfit.id,
      items_added: added,
      items_skipped_unavailable: unavailable,
      items_skipped_in_cart: split.inCart.length,
      items_skipped_own: split.ownListing.length,
      total_credits: totalCredits
    })

    if (added === outfit.items.length) {
      toast.success(t('outfits.toast.added'))
    } else {
      toast.success(
        t('outfits.toast.partial', {
          added,
          total: outfit.items.length,
          unavailable,
          inCart: split.inCart.length,
          own: split.ownListing.length
        })
      )
    }
  }

  return {
    split,
    missingCount,
    availableCount: split.purchasable.length + split.inCart.length,
    totalCredits,
    addOutfit
  }
}

/** Refresh every outfit-derived query after a studio mutation (row, detail and studio list). */
export function invalidateOutfitQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['outfits'] })
  void queryClient.invalidateQueries({ queryKey: ['outfit'] })
  void queryClient.invalidateQueries({ queryKey: ['outfits-all'] })
}

export type OutfitCreatorAccess =
  /** Not known yet — a gate must render NEITHER verdict. */
  | 'pending'
  /** Show the studio. */
  | 'creator'
  /** Hide it. */
  | 'denied'

/**
 * Whether the signed-in account may see the outfit studio. COSMETIC (the bundle is static): the
 * real gate is shop-server's OUTFIT_CREATORS allowlist against the signed-fetch address. Fails
 * closed once known — a flag outage just hides the studio entry.
 *
 * Tri-state for the same reason {@link useShopPrelaunch} is: the two inputs settle independently —
 * the flag over the network, the session from storage — so answering on the first reading is a
 * guess, and the guess is what flashed the sign-in gate on every refresh of the studio.
 */
export function useOutfitCreatorAccess(): OutfitCreatorAccess {
  const address = useWallet(s => s.session?.address)
  // Whether the silent session restore has FINISHED, which `address` alone cannot say: it is
  // undefined both for a visitor with no session and for one still being read back.
  const restored = useWallet(s => s.restored)

  const { data, isPending } = useQuery({
    queryKey: ['feature-flag', 'shop-outfit-creators'],
    queryFn: async () => {
      const armed = await getIsFeatureEnabled(FeatureFlag.SHOP_OUTFIT_CREATORS)
      if (!armed) return { armed: false, allowed: [] as string[] }
      return { armed: true, allowed: await getAddressListVariant(FeatureFlag.SHOP_OUTFIT_CREATORS) }
    },
    // Matches the 60s the flag lib caches for, so the two TTLs don't compete.
    staleTime: 60_000,
    retry: 1
  })

  if (!isOutfitsAvailable()) return 'denied'
  if (!restored) return 'pending'
  // Nobody signed in is a creator whatever the flag says, so don't make the page wait on the flag
  // fetch to learn it — this is what keeps the public detail page answering immediately.
  if (!address) return 'denied'
  if (isPending) return 'pending'
  // No data with the query settled means it failed, which fails closed like every other flag read.
  if (!data?.armed) return 'denied'
  return data.allowed.includes(address.toLowerCase()) ? 'creator' : 'denied'
}

/** {@link useOutfitCreatorAccess} for callers with nothing to render while it settles. */
export function useIsOutfitCreator(): boolean {
  return useOutfitCreatorAccess() === 'creator'
}
