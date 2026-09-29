import { useRunningCampaign } from '~/hooks/useRunningCampaign'

/**
 * The label for the seasonal event's nav tab, or `null` when there is no tab to show.
 *
 * The tab appears exactly when an event is RUNNING — see `useRunningCampaign` for what that requires, and
 * why "published" is not enough.
 */
export function useEventTab(): string | null {
  return useRunningCampaign()?.label ?? null
}
