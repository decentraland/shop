/**
 * The seasonal SKINS a campaign can wear: the page field, its drifting tile and the event tab.
 *
 * A theme is CODE, not content — each one is a block of CSS and an image in the bundle — so the CMS cannot
 * invent one. What the CMS (or the flag) chooses is which of these to wear, and an unknown name simply
 * reads as "no theme", leaving the Shop in its ordinary purple.
 *
 * Kept apart from `styles/theme.ts`: that is the design system every surface imports, this is a temporary
 * coat of paint over it that most of the year is not there at all.
 */
export const CAMPAIGN_THEMES = ['halloween'] as const

export type CampaignTheme = (typeof CAMPAIGN_THEMES)[number]

/**
 * A theme name as the flag or the CMS spells it, or `null` for anything this build cannot paint.
 *
 * Case and spacing are forgiven because the value is typed by hand in a dashboard, where `Halloween` is at
 * least as likely as `halloween`.
 */
export function parseCampaignTheme(value: string | null | undefined): CampaignTheme | null {
  const slug = value?.trim().toLowerCase()
  return CAMPAIGN_THEMES.includes(slug as CampaignTheme) ? (slug as CampaignTheme) : null
}
