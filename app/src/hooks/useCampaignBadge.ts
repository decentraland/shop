import { useRunningCampaign } from '~/hooks/useRunningCampaign'
import { isInCampaign } from '~/lib/campaign'

/**
 * The event label to show on an item that belongs to the running seasonal event, or `null`.
 *
 * The LABEL, deliberately, and not the campaign's tag. The tag is an internal identifier — `MVMF22`,
 * `halloween2026` — and the marketplace putting it on screen is a bug rather than something to copy.
 */
export function useCampaignBadge(contractAddress: string | undefined | null, itemId?: string | null): string | null {
  const campaign = useRunningCampaign()

  if (!campaign || !isInCampaign(campaign.contracts, contractAddress, campaign.items, itemId)) return null
  return campaign.label
}
