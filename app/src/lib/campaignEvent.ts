import type { CampaignTheme } from '~/lib/campaignTheme'

export type ThemeEvent = {
  /** i18n key for the event's name: its nav tab, its rail, its page title and its badge on cards. */
  labelKey: string
  /** Collection addresses, lowercased. */
  collections: string[]
  /** Loose items, as `<contract>-<itemId>` with a lowercased contract. */
  items: string[]
}

/**
 * The event a theme ships in the bundle. While that theme runs it replaces the CMS campaign on every event
 * surface, so a seasonal event can go out with the flag alone, the same way its hero art does.
 */
const THEME_EVENTS: Partial<Record<CampaignTheme, ThemeEvent>> = {
  holidays: {
    labelKey: 'campaign.holidaysTab',
    collections: [],
    items: []
  }
}

/** The event the running theme ships in the bundle, or `null` when the CMS campaign decides. */
export function campaignThemeEvent(theme: CampaignTheme | null): ThemeEvent | null {
  return (theme && THEME_EVENTS[theme]) || null
}
