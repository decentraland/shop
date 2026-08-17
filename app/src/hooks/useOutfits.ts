import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'

import { useManaRate } from '~/hooks/useManaRate'
import { track } from '~/lib/analytics'
import { fetchCatalogByIds, type CatalogItem } from '~/lib/api'
import { FeatureFlag, getAddressListVariant, getIsFeatureEnabled } from '~/lib/featureFlags'
import { displayCredits } from '~/lib/mana-convert'
import { captureError } from '~/lib/monitoring'
import {
  fetchOutfits,
  isOutfitsAvailable,
  listingIdentity,
  outfitItemKey,
  resolveOutfitPurchases,
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
 *
 * Those rows are MANA-priced, so this is also where they get their credit price, at the live oracle
 * rate — the same rule and the same helper the browse grid uses for a legacy card. The rate is folded
 * into `isLoading`/`isError` rather than left to each surface: a row with no rate yet has no honest
 * price, and every outfit surface already knows how to wait (or to show a retry) rather than price an
 * item at zero and call it unavailable.
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
  // Not part of the query key: the rate ticks every minute and must never invalidate the catalog read.
  const { data: rate, isLoading: rateLoading, isError: rateError, refetch: refetchRate } = useManaRate()

  return useMemo(() => {
    const priced = (data ?? []).map(item => ({ ...item, priceCredits: displayCredits(item, rate) }))
    const byKey = new Map(priced.map(item => [item.id, item]))
    const missing = new Set(data ? keys.filter(key => !byKey.has(key)) : [])
    return {
      byKey,
      missing,
      isLoading: keys.length > 0 && (isLoading || rateLoading),
      isError: isError || rateError,
      retry: () => {
        void refetch()
        void refetchRate()
      }
    }
  }, [data, keys, isLoading, isError, refetch, rate, rateLoading, rateError, refetchRate])
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
  /**
   * What the LOOK costs: every resolved item, including ones this viewer can't buy.
   *
   * Distinct from `totalCredits` on purpose. The two are equal for most outfits, which is why one
   * value used to serve both — but the moment an item drops out of the basket (your own listing,
   * already in the cart, delisted) a price labelled "total price" that silently shrinks is simply
   * wrong: a two-item look priced 14 + 1 read as 1.
   */
  outfitCredits: number
  addOutfit: () => void
  /** True while the CTA is re-reading live listings; disarms it so a double-click can't double-add. */
  isAdding: boolean
}

/**
 * The shared add-outfit-to-cart behavior for the card and the detail page: filter-and-skip (never
 * quantity bumps — two outfits sharing a shirt yield one shirt), one outfit-level analytics event
 * with the skip-reason breakdown on top of the per-item `source: 'outfit'` events, and an honest
 * toast when anything was skipped.
 *
 * The add itself is ASYNC because what is displayed and what may be bought come from different
 * feeds: the cards resolve through the batched /v2 catalog (cheap enough for a whole row), but a
 * cart line has to carry the shop feed's `acquisition` / `available` / `tradeId` or checkout cannot
 * take the right rail for it. So the CTA re-reads the items it is about to add and puts THOSE rows
 * in the cart — see resolveOutfitPurchases.
 */
export function useOutfitCart(outfit: Outfit, resolution: OutfitItemsResolution): OutfitCart {
  const add = useCart(s => s.add)
  const cartItems = useCart(s => s.items)
  const address = useWallet(s => s.session?.address)
  const [isAdding, setIsAdding] = useState(false)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Cart membership is compared on the cross-feed identity, not the raw `id`: a line added from the
  // browse grid is keyed by its trade id, an outfit's /v2 row by `contract-itemId`, and the same
  // wearable must count as "already in your cart" whichever door it came through.
  const cartKeys = useMemo(() => new Set(cartItems.map(listingIdentity)), [cartItems])

  const resolved = useMemo(
    () =>
      outfit.items.map(ref => resolution.byKey.get(outfitItemKey(ref))).filter((item): item is CatalogItem => !!item),
    [outfit, resolution.byKey]
  )
  const split = useMemo(() => splitOutfitItems(resolved, { address, cartKeys }), [resolved, address, cartKeys])
  const missingCount = outfit.items.length - resolved.length
  const totalCredits = split.purchasable.reduce((n, item) => n + item.priceCredits, 0)
  const outfitCredits = resolved.reduce((n, item) => n + item.priceCredits, 0)

  const addOutfit = useCallback(() => {
    if (isAdding || split.purchasable.length === 0) return
    setIsAdding(true)

    void (async () => {
      try {
        const live = await resolveOutfitPurchases(
          split.purchasable.map(item => ({ contractAddress: item.contractAddress, itemId: item.itemId ?? '' }))
        )
        // Deliberately NOT gated on still being mounted: the cart and the toasts are global stores,
        // and the click already happened. A card that unmounts mid-flight (the row re-resolving and
        // re-filtering under it) must still deliver the basket the buyer asked for — only the local
        // isAdding state below has to care about the unmount.
        const items = [...live.values()]
        items.forEach(item => add(item, 'outfit', outfit.id))

        const added = items.length
        // An item the card offered but the shop feed no longer sells (delisted or minted out between
        // the card rendering and this click) joins the unavailable count — it is a real sell-out, not
        // the outage case, which throws and is handled below.
        const unavailable = split.unavailable.length + missingCount + (split.purchasable.length - added)
        track('Shop Outfit Added To Cart', {
          outfit_id: outfit.id,
          items_added: added,
          items_skipped_unavailable: unavailable,
          items_skipped_in_cart: split.inCart.length,
          items_skipped_own: split.ownListing.length,
          total_credits: items.reduce((n, item) => n + item.priceCredits, 0)
        })

        if (added === 0) {
          toast.error(t('outfits.toast.noneLeft'))
        } else if (added === outfit.items.length) {
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
      } catch (e) {
        // Could not READ the listings — an outage is never rendered as a sell-out, and half a look is
        // not a basket anyone asked for. Nothing is added; the CTA stays live to try again.
        captureError(e, { flow: 'outfit-add-to-cart' })
        toast.error(t('outfits.toast.addFailed'))
      } finally {
        if (mountedRef.current) setIsAdding(false)
      }
    })()
  }, [isAdding, split, missingCount, outfit.id, outfit.items.length, add])

  return {
    split,
    missingCount,
    availableCount: split.purchasable.length + split.inCart.length,
    totalCredits,
    outfitCredits,
    addOutfit,
    isAdding
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
