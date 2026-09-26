import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useCampaign, useCampaignEnabled } from '~/hooks/useCampaign'
import { parseCampaignTheme, type CampaignTheme } from '~/lib/campaignTheme'
import { FeatureFlag, getVariantValue } from '~/lib/featureFlags'

/** The attribute the themed CSS hangs off, set on `<html>`. Also the key `dataset` writes it under. */
const ATTRIBUTE = 'campaignTheme'

/**
 * The seasonal skin the Shop is wearing, or `null` for its ordinary purple.
 *
 * Two sources, in this order:
 *
 * 1. The `shop-campaign` flag's VARIANT payload. The deliberate one — a theme is a whole-site visual
 *    change, and whoever needs to undo it at 2am wants one switch in the flag dashboard, not a CMS entry
 *    in a space owned by another team.
 * 2. Failing that — only when the payload is ABSENT — the campaign's own `mainTag`. An event tagged
 *    `halloween` gets the Halloween skin with nothing configured at all, which is what makes a new
 *    campaign previewable the moment it is published.
 *
 * Gated on the campaign flag like every other event surface: no event, no skin. An unknown name from
 * either source reads as `null` rather than as an error, so a campaign tagged `prom` simply is not themed.
 */
export function useCampaignTheme(): CampaignTheme | null {
  const enabled = useCampaignEnabled()
  const { campaign } = useCampaign()

  const { data, isPending } = useQuery({
    queryKey: ['feature-flag-variant', 'shop-campaign'],
    queryFn: () => getVariantValue(FeatureFlag.SHOP_CAMPAIGN),
    enabled,
    // The lib caches for 60s behind this; keeping react-query's window in step avoids two competing TTLs.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1
  })

  if (!enabled) return null
  // Nothing is worn until the variant has ANSWERED. The two sources are independent queries against
  // different backends, so without this the CMS can win the race on a cold load: the tag would paint the
  // skin for a moment even when the operator's payload says to take it off — a flash of exactly the thing
  // the kill switch exists to stop, in exactly the incident it exists for.
  if (isPending) return null
  // A payload that is THERE decides, even when it names no theme we can paint: writing `none` in the
  // variant is how an operator takes the skin off a running campaign without waiting on a CMS edit, and
  // falling through to the tag would quietly ignore them. Only an absent payload defers to the tag.
  if (data) return parseCampaignTheme(data)
  return parseCampaignTheme(campaign?.mainTag)
}

/**
 * Publishes the running theme as `data-campaign-theme` on `<html>`.
 *
 * On the root element rather than threaded through props because the skin repaints surfaces that have no
 * reason to know an event exists — the page field, the drifting tile, a nav tab. Each of those reaches it
 * with a `:root[data-campaign-theme='…'] &` selector and needs no new prop, and the whole feature stays a
 * single attribute that can be set by hand in devtools to preview a theme.
 */
export function useCampaignThemeAttribute(): CampaignTheme | null {
  const theme = useCampaignTheme()

  useEffect(() => {
    if (!theme) return
    const root = document.documentElement
    root.dataset[ATTRIBUTE] = theme
    return () => {
      delete root.dataset[ATTRIBUTE]
    }
  }, [theme])

  // Handed back so a caller that ALSO needs the value (App mounts the decorations on it) does not
  // subscribe a second time to the very queries this hook already reads.
  return theme
}
