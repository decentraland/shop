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
export const CAMPAIGN_THEMES = ['halloween', 'holidays'] as const

export type CampaignTheme = (typeof CAMPAIGN_THEMES)[number]

/** Other names a campaign tag is likely to carry for a theme, so tagging the event `christmas` still dresses it. */
const ALIASES: Partial<Record<string, CampaignTheme>> = {
  christmas: 'holidays',
  xmas: 'holidays'
}

/**
 * A theme name as the flag or the CMS spells it, or `null` for anything this build cannot paint.
 *
 * Case and spacing are forgiven because the value is typed by hand in a dashboard, where `Halloween` is at
 * least as likely as `halloween`.
 */
export function parseCampaignTheme(value: string | null | undefined): CampaignTheme | null {
  const slug = value?.trim().toLowerCase() ?? ''
  const theme = ALIASES[slug] ?? slug
  return CAMPAIGN_THEMES.includes(theme as CampaignTheme) ? (theme as CampaignTheme) : null
}
