import { useQuery } from '@tanstack/react-query'

import { FeatureFlag, getAddressListVariant, getIsFeatureEnabled } from '~/lib/featureFlags'
import { useWallet } from '~/store/wallet'

/**
 * Whether to show the pre-launch holding page instead of the Shop.
 *
 * COSMETIC BY CONSTRUCTION. This bundle is static and the APIs behind it are public, so anyone can pull this
 * curtain aside with devtools or ignore it entirely and call the API directly. That is fine, because it is
 * not what protects anything: the same `shop-prelaunch` flag is read server-side by credits-server on
 * /credits/authorize, against the signed-fetch address, and THAT refuses the purchase. The job here is that
 * someone who wanders in before the announcement isn't confused — not that they're stopped.
 *
 * FAILS OPEN. A slow or unreachable flag service resolves to `false` and the Shop renders. That is the
 * opposite of every other flag read in this app, and it is deliberate: hiding is the positive condition here,
 * so `getIsFeatureEnabled`'s fail-closed behaviour gives us fail-open for free. The consequence matters more
 * than the symmetry — a flag outage on launch day would otherwise show a holding page to the entire world,
 * while the same outage before launch merely reveals an unannounced URL whose money path is still closed.
 */
export function useShopPrelaunch(): boolean {
  const address = useWallet(s => s.session?.address)

  const { data } = useQuery({
    queryKey: ['feature-flag', 'shop-prelaunch'],
    queryFn: async () => {
      const armed = await getIsFeatureEnabled(FeatureFlag.SHOP_PRELAUNCH)
      if (!armed) return { armed: false, allowed: [] as string[] }
      return { armed: true, allowed: await getAddressListVariant(FeatureFlag.SHOP_PRELAUNCH) }
    },
    // Matches the 60s the flag lib caches for, so the two TTLs don't compete.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  if (!data?.armed) return false
  // An armed gate with no address connected hides the Shop: a visitor before launch is exactly who this is
  // for. Note the asymmetry with the server, which refuses EVERYONE when the list is empty — there, an empty
  // list is a misconfiguration on a money path and closing is the safe reading. Here the list being empty
  // just means nobody has been let in yet, which is the same as not being on it.
  if (!address) return true
  return !data.allowed.includes(address.toLowerCase())
}
