import { useQuery } from '@tanstack/react-query'

import { FeatureFlag, getAddressListVariant, getIsMyStoreEnabled } from '~/lib/featureFlags'
import { useWallet } from '~/store/wallet'

/**
 * Whether the creator's store dashboard is on for the visitor looking at it.
 *
 * The flag decides whether the feature exists at all; its VARIANT, when it carries one, narrows that to a
 * list of addresses. An absent or empty list is NOT an empty guest list — it means nobody asked for a
 * restriction, so the flag alone answers and everyone gets in. That is the opposite reading from the
 * pre-launch gate, where an empty list hides the Shop from all, and the reason is what each flag is for:
 * this one opens something new, that one closes everything until launch.
 */
export type MyStoreAccess =
  /** Not known yet — show NEITHER the page nor its absence. */
  'pending' | 'on' | 'off'

export function useMyStoreAccess(): MyStoreAccess {
  const address = useWallet(s => s.session?.address)
  // Whether the silent wallet restore has FINISHED, which `address` alone cannot say: it is undefined both
  // for a visitor with no wallet and for one whose session is still being read back. Only consulted when a
  // list exists, so a flag with no variant never waits on the wallet for an answer it does not need.
  const walletRestored = useWallet(s => s.restored)

  const { data, isPending } = useQuery({
    queryKey: ['feature-flag', 'shop-my-store'],
    queryFn: async () => {
      const on = await getIsMyStoreEnabled()
      // The list is only fetched once the flag says yes, so an allowlist left behind on a flag that was
      // turned off cannot let anyone in through the back.
      if (!on) return { on: false, only: [] as string[] }
      return { on: true, only: await getAddressListVariant(FeatureFlag.SHOP_MY_STORE) }
    },
    // Matches the 60s the flag lib caches for, so the two TTLs don't compete.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  if (isPending) return 'pending'
  // No data with the query settled means the read failed. `getIsMyStoreEnabled` catches its own errors and
  // resolves false, so this is unreachable today; it is spelled out so the fail-closed direction stops being
  // inherited from a detail of another module.
  if (!data?.on) return 'off'
  if (data.only.length === 0) return 'on'
  if (!walletRestored) return 'pending'
  return address !== undefined && data.only.includes(address.toLowerCase()) ? 'on' : 'off'
}

/**
 * Whether to offer the dashboard, for the surfaces that only need a yes or no.
 *
 * Fails closed while the answer is in flight, so the nav entry never flashes in and out on a slow flag
 * read — a link that appears a beat late is worse than one that appears once. My Items reads the same
 * answer to decide whether to keep its own creations section, and a pending read leaving that section in
 * place is the safe direction there: a creator is never left without a way to reach their collections.
 */
export function useMyStoreEnabled(): boolean {
  return useMyStoreAccess() === 'on'
}
