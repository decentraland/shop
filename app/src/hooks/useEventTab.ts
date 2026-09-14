import { useCampaign } from '~/hooks/useCampaign'
import { useCampaignContracts } from '~/hooks/useCampaignContracts'
import { localized, toContentfulLocale } from '~/lib/contentful'
import { useLocale } from '~/store/locale'

/**
 * The label for the seasonal event's nav tab, or `null` when there is no tab to show.
 *
 * Three things have to hold before the tab appears, and the third is the one worth stating: the campaign
 * must have resolved to AT LEAST ONE COLLECTION. A tab that opens an empty grid is worse than no tab, and
 * an event tag that nobody has applied yet is a normal state — the entry is often published days before
 * the collections are tagged.
 *
 * Nothing is fetched while the feature is off, so the navbar costs no requests on an ordinary day.
 */
export function useEventTab(): string | null {
  const locale = useLocale(s => s.locale)
  const { campaign } = useCampaign()
  const { contracts } = useCampaignContracts(campaign?.tags ?? [])

  if (!campaign?.mainTag || contracts.length === 0) return null

  const label = localized(campaign.tabName, toContentfulLocale(locale))?.trim()
  return label || null
}
