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
    collections: [
      '0xff520a78567d6c8c604fbf55a00e2660f08abc65', // Santa's Helper Collection
      '0x0ed5826bfbcfb17924ca40fcf80b93b6219220d8', // Sweet and Striped
      '0x92f5bb286d34a4fd2a94611811985e7cd0af9887', // Winter Edition
      '0x3d2f96faf466d203b778b079abd4435b8d3fc803' // Quilted Winter Sets
    ],
    items: [
      '0x916a896318f2ac178862c7ebfd072b39a6b438cd-0', // Santa's Hat 2025
      '0x0ed5826bfbcfb17924ca40fcf80b93b6219220d8-2', // Candy Cane Hat
      '0xb40941e690d7ad18abf6db0a5276375f035239e9-1', // Frosty The SnowMask
      '0x8d15b04d0338e260a375bd0f9320c982c2f0bd00-0', // It's Lit Xmas Sweater
      '0x4f7e5e7f3e4f6a2b0ceb1ebb005de21d57f200f0-0', // Cringe Sweater
      '0xe9feeb733476d4f31c49873f3cbadc949e2e3d57-0', // Merry Kiss My Ass
      '0xb6b7117589fab0dd6416b116d3e40dc6ea4cfe7b-0', // Santa's Slay Beard & Mustache
      '0x10a078868e6d8c21e1eb40d99ed0fae88dddaacb-0', // Xmas Deer
      '0x10a078868e6d8c21e1eb40d99ed0fae88dddaacb-2', // Xmas White Deer
      '0xe1e22e48719342ab746841b21dac98d4a8c13496-2' // Santa Wings
    ]
  }
}

/** The event the running theme ships in the bundle, or `null` when the CMS campaign decides. */
export function campaignThemeEvent(theme: CampaignTheme | null): ThemeEvent | null {
  return (theme && THEME_EVENTS[theme]) || null
}
