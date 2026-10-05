import { useQuery } from '@tanstack/react-query'

import { FeatureFlag, getFlagWithVariant } from '~/lib/featureFlags'
import { parseCampaignVariant } from '~/lib/campaignVariant'
import { fetchCampaign, isContentfulConfigured, type Campaign } from '~/lib/contentful'
import { useWallet } from '~/store/wallet'

export type CampaignFlagState = {
  enabled: boolean
  isPending: boolean
  /** The theme the payload names, as written. `null` when it names none, which defers to the campaign tag. */
  theme: string | null
}

/**
 * The flag behind every event surface, with its variant payload applied.
 *
 * The flag decides whether the event exists at all; the payload's address list, when it carries one,
 * narrows that to those accounts so an event can be rehearsed on production before it is announced. A
 * payload with NO list restricts nobody, so the flag alone answers and everyone sees the event, which is
 * how every campaign to date was shipped.
 *
 * This hides the event; it does not keep a secret. The address list and the theme name are served in a
 * public flag file, the seasonal CSS and artwork ship in the bundle to everybody, the CMS entry is public,
 * and the address compared here comes from the visitor's own restored session. It is the right tool for
 * keeping a half-finished skin off the storefront, and the wrong one for anything confidential.
 */
export function useCampaignFlag(): CampaignFlagState {
  const address = useWallet(s => s.session?.address)
  // Whether the silent wallet restore has FINISHED, which `address` alone cannot say: it is undefined both
  // for a visitor with no account and for one whose session is still being read back. Only consulted when a
  // list exists, so an unrestricted event never waits on the wallet for an answer it does not need.
  const walletRestored = useWallet(s => s.restored)

  const { data, isPending } = useQuery({
    queryKey: ['feature-flag', 'shop-campaign'],
    queryFn: async () => {
      // Both answers from ONE snapshot: read apart, the pair can straddle a cache expiry and report a live
      // flag with no payload, which reads as "nothing was restricted" and publishes the event.
      const { enabled, variant } = await getFlagWithVariant(FeatureFlag.SHOP_CAMPAIGN)
      // A list left behind on a flag that was turned off cannot let anyone in through the back.
      if (!enabled) return { on: false, ...parseCampaignVariant(null) }
      return { on: true, ...parseCampaignVariant(variant) }
    },
    // The lib caches for 60s behind this; keeping react-query's window in step avoids two competing TTLs.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  if (isPending || !data) return { enabled: false, isPending: true, theme: null }
  if (!data.on) return { enabled: false, isPending: false, theme: null }
  if (data.only === null) return { enabled: true, isPending: false, theme: data.theme }
  // A list that matches nobody is still a list. Nothing to wait for and nobody to let in — the usual cause
  // is a payload that meant to name accounts and named none of them.
  if (data.only.length === 0) return { enabled: false, isPending: false, theme: null }
  // Still pending rather than off: answering "no event" from a half-restored session would show the
  // ordinary Shop to a listed reviewer for a beat, then swap the event in underneath them.
  if (!walletRestored) return { enabled: false, isPending: true, theme: null }

  const allowed = address !== undefined && data.only.includes(address.toLowerCase())
  return { enabled: allowed, isPending: false, theme: allowed ? data.theme : null }
}

export type CampaignQuery = {
  /** `undefined` until the CMS answers, and whenever there is nothing to show. */
  campaign: Campaign | undefined
  /** True until the answer is actually known — the flag read included. */
  isPending: boolean
  /** The CMS could not be reached. Distinct from "there is no campaign", which is not an error. */
  isError: boolean
}

/**
 * The environment's marketing content: the banners, and the event's tag and tab label when one is running.
 *
 * Nothing is fetched while the flag is off or the environment has no CMS configured, so an environment
 * without an admin entry issues no request at all.
 *
 * Five minutes of staleness rather than the Marketplace's fetch-once-at-boot: a CMS edit then reaches a tab
 * that is already open without a reload, which is what "marketing can end the event without a deploy"
 * actually requires, and the cost is one request per five minutes per open tab.
 *
 * `isPending` covers the FLAG's own read, not just the CMS read. Without that the hook reports
 * "settled, no campaign" for the moment the flag is in flight — and a consumer that acts on that answer
 * (the event route, which redirects away when the campaign is gone) would bounce the visitor off the page
 * on every cold load.
 */
export function useCampaign(): CampaignQuery {
  const flag = useCampaignFlag()
  const configured = isContentfulConfigured()
  const active = flag.enabled && configured

  const { data, isPending, isError } = useQuery({
    queryKey: ['campaign'],
    queryFn: fetchCampaign,
    enabled: active,
    staleTime: 5 * 60_000,
    retry: 1
  })

  return {
    campaign: active ? (data ?? undefined) : undefined,
    // An environment with no CMS has no campaign, and knows it immediately — there is nothing to wait for.
    isPending: configured && (flag.isPending || (active && isPending)),
    isError: active && isError
  }
}
