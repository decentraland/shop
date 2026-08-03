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
export type PrelaunchDecision =
  /** Not known yet — render NEITHER the Shop nor the curtain. */
  | 'pending'
  /** Show the Shop. */
  | 'open'
  /** Show the holding page. */
  | 'hidden'

export function useShopPrelaunch(): PrelaunchDecision {
  const address = useWallet(s => s.session?.address)
  // Whether the silent wallet restore has FINISHED, which `address` alone cannot say: it is undefined both
  // for a visitor with no wallet and for one whose session is still being read back. Deciding on the first
  // reading is what made an allowed wallet see the curtain for a moment on every refresh — the flag
  // resolved before the session did, so for one render the gate was armed and the address unknown.
  const walletRestored = useWallet(s => s.restored)

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
  //
  // `prelaunchLocalPreview` adds the local dev server on request, so the curtain — and more to the point the
  // way it RESOLVES — can be exercised with `npm run dev` instead of only after a deploy. Opt-in rather than
  // "any dev build" because `import.meta.env.DEV` is also true under vitest, which would silently arm the
  // gate for every spec and make "dev is never curtained" untestable.
  const gatedEnvironment = config.isProduction || config.isStaging || config.prelaunchLocalPreview

  const { data, isPending } = useQuery({
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

  // Ungated environments answer IMMEDIATELY rather than through 'pending': there is no curtain to get
  // wrong, so making dev wait on a flag fetch would delay the Shop for nothing.
  if (!gatedEnvironment) return 'open'

  // From here the answer is withheld until it is actually known. Both inputs matter and they settle
  // independently — the flag over the network, the wallet from storage — so either one still outstanding
  // means the decision would be a guess, and a guess is what the flicker was.
  if (isPending) return 'pending'

  // No data with the query no longer pending means it FAILED, and this fails OPEN — stated here rather than
  // inherited. `getIsFeatureEnabled` catches its own errors and resolves `false`, so today the queryFn cannot
  // reject and this branch is unreachable; the point is that it stops being load-bearing on that. Were the
  // flag lib ever to propagate instead, react-query would settle into `status: 'error'` with `data:
  // undefined` — `isPending` false, `data` absent — and treating that as 'pending' would leave a permanent
  // blank page for everyone, which is the exact opposite of what the fail-open contract above promises.
  if (!data) return 'open'

  if (!data.armed) return 'open'
  if (!walletRestored) return 'pending'
  // An armed gate with no address connected hides the Shop: a visitor before launch is exactly who this is
  // for. Note the asymmetry with the server, which refuses EVERYONE when the list is empty — there, an empty
  // list is a misconfiguration on a money path and closing is the safe reading. Here the list being empty
  // just means nobody has been let in yet, which is the same as not being on it.
  if (!address) return 'hidden'
  return data.allowed.includes(address.toLowerCase()) ? 'open' : 'hidden'
}
