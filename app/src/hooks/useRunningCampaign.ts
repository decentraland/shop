import { useCampaign } from '~/hooks/useCampaign'
import { useCampaignContracts } from '~/hooks/useCampaignContracts'
import { localized, toContentfulLocale } from '~/lib/contentful'
import { useLocale } from '~/store/locale'

export type RunningCampaign = {
  /** What the event is called, in the reader's language. CMS content, so it never goes through `t()`. */
  label: string
  /** The collections it selected, lowercased. Never empty — a campaign with none is not running. */
  contracts: string[]
}

/**
 * The seasonal event that is actually running, or `null`.
 *
 * "Running" is stricter than "published", and the difference is the third condition below — the one that
 * keeps every surface consistent with what a visitor would find if they followed it:
 *
 * 1. a campaign entry exists and names a tag,
 * 2. it has a name to put on screen,
 * 3. its tag resolves to AT LEAST ONE collection.
 *
 * The third matters because an entry is often published days before anyone tags the collections. Without
 * it the nav would offer a tab onto an empty grid, and an item page would advertise an event that leads
 * nowhere.
 *
 * Nothing is fetched while the feature is off, so this costs no requests on an ordinary day.
 */
export function useRunningCampaign(): RunningCampaign | null {
  const locale = useLocale(s => s.locale)
  const { campaign } = useCampaign()
  const { contracts } = useCampaignContracts(campaign?.tags ?? [])

  if (!campaign?.mainTag || contracts.length === 0) return null

  const label = localized(campaign.tabName, toContentfulLocale(locale))?.trim()
  return label ? { label, contracts } : null
}
