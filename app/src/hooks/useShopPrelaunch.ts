import { useQuery } from '@tanstack/react-query'

import { config } from '~/config'
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

  // PUBLIC SURFACES ONLY (production + staging), and by a runtime hostname check rather than by the flag.
  //
  // Staging counts because it is no longer a second copy of dev: it reads the production APIs, Polygon and
  // the production credits-server, which makes it the launch rehearsal — and a rehearsal that cannot show
  // the curtain is not rehearsing the launch. Dev stays exempt: it is the internal surface, on a testnet,
  // where QA and design work without a wallet and hiding the Shop buys nothing.
  //
  // The obvious alternative — scoping the flag with a hostname strategy — is the trapdoor this deliberately
  // avoids: those are evaluated against the REFERER, and the browser and credits-server present different
  // ones, so the two halves of this gate could silently disagree about whether the Shop is open.
  // `core-stripe-payments` is already misconfigured that way. The flag stays global; the environment
  // question is answered where the answer is deterministic.
  //
  // The SERVER gate (credits-server) is deliberately NOT environment-scoped: armed on dev it only refuses
  // purchases from wallets outside the allowlist, which is harmless there and is the half that must never
  // fail open.

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

  if (!config.isProduction && !config.isStaging) return false
  if (!data?.armed) return false
  // An armed gate with no address connected hides the Shop: a visitor before launch is exactly who this is
  // for. Note the asymmetry with the server, which refuses EVERYONE when the list is empty — there, an empty
  // list is a misconfiguration on a money path and closing is the safe reading. Here the list being empty
  // just means nobody has been let in yet, which is the same as not being on it.
  if (!address) return true
  return !data.allowed.includes(address.toLowerCase())
}
