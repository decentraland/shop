import { useCampaign } from '~/hooks/useCampaign'
import { useCampaignContracts } from '~/hooks/useCampaignContracts'
import { localized, toContentfulLocale } from '~/lib/contentful'
import { useLocale } from '~/store/locale'

export type RunningCampaign = {
  /** What the event is called, in the reader's language. CMS content, so it never goes through `t()`. */
  label: string
  /** The collections it selected, lowercased. MAY BE EMPTY while nobody has tagged any yet. */
  contracts: string[]
}

/**
 * The seasonal event that is actually running, or `null`.
 *
 * Two conditions: a campaign entry that names a tag, and a name to put on screen.
 *
 * It deliberately does NOT wait for the tag to resolve to a collection. That condition was here, on the
 * reasoning that a tab onto an empty grid is worse than no tab, and it was wrong twice over: it made the
 * Shop disagree with the Marketplace, which shows its tab on the campaign alone, and it made the tab
 * impossible to preview outside production, since no collection on the `.zone` builder carries any tag at
 * all. An event whose collections have not been tagged yet now shows its tab over an empty grid — the same
 * thing the Marketplace does, and visible to whoever is staging the event.
 *
 * The grid is still safe when the set is empty: `contracts: []` reaches it AS an empty set, which it
 * renders as an empty state without querying, never as the unfiltered catalogue.
 *
 * Nothing is fetched while the feature is off, so this costs no requests on an ordinary day.
 */
export function useRunningCampaign(): RunningCampaign | null {
  const locale = useLocale(s => s.locale)
  const { campaign } = useCampaign()
  const { contracts } = useCampaignContracts(campaign?.tags ?? [], campaign?.collections)

  if (!campaign?.mainTag) return null

  const label = localized(campaign.tabName, toContentfulLocale(locale))?.trim()
  return label ? { label, contracts } : null
}
