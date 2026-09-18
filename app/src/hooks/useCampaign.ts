import { useQuery } from '@tanstack/react-query'

import { FeatureFlag, getIsFeatureEnabled } from '~/lib/featureFlags'
import { fetchCampaign, isContentfulConfigured, type Campaign } from '~/lib/contentful'

type FlagState = { enabled: boolean; isPending: boolean }

function useCampaignFlag(): FlagState {
  const { data, isPending } = useQuery({
    queryKey: ['feature-flag', 'shop-campaign'],
    queryFn: () => getIsFeatureEnabled(FeatureFlag.SHOP_CAMPAIGN),
    // The lib caches for 60s behind this; keeping react-query's window in step avoids two competing TTLs.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  return { enabled: data === true, isPending }
}

/**
 * Whether the Shop's seasonal-event surfaces are switched on. See `FeatureFlag.SHOP_CAMPAIGN` — this is the
 * code's kill switch, not how an event is started or ended.
 *
 * Reads `false` while the flag itself is still loading. Fine for a surface that simply appears when the
 * answer arrives; anything that has to ACT on "there is no event" wants `useCampaign`'s `isPending`, which
 * covers this window too.
 */
export function useCampaignEnabled(): boolean {
  return useCampaignFlag().enabled
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
