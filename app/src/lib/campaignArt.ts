import type { Locale } from '~/intl/i18n'
import type { CampaignTheme } from '~/lib/campaignTheme'
import holidaysDe from '~/assets/campaign/holidays/hero-de.webp'
import holidaysEn from '~/assets/campaign/holidays/hero-en.webp'
import holidaysEs from '~/assets/campaign/holidays/hero-es.webp'
import holidaysPt from '~/assets/campaign/holidays/hero-pt.webp'
import holidaysMobileDe from '~/assets/campaign/holidays/hero-mobile-de.webp'
import holidaysMobileEn from '~/assets/campaign/holidays/hero-mobile-en.webp'
import holidaysMobileEs from '~/assets/campaign/holidays/hero-mobile-es.webp'
import holidaysMobilePt from '~/assets/campaign/holidays/hero-mobile-pt.webp'

export type CampaignArt = {
  desktop: string
  mobile: string
  /** i18n key for the headline lettered into the artwork, read out in its place. */
  headlineKey: string
}

type ThemeArt = { headlineKey: string; images: Record<Locale, { desktop: string; mobile: string }> }

/**
 * Hero artwork a theme ships in the bundle, one pair per locale because the headline is lettering inside the
 * image. Typed over every `Locale`, so adding a language without its artwork fails to compile.
 */
const HERO_ART: Partial<Record<CampaignTheme, ThemeArt>> = {
  holidays: {
    headlineKey: 'campaign.holidaysHeadline',
    images: {
      en: { desktop: holidaysEn, mobile: holidaysMobileEn },
      es: { desktop: holidaysEs, mobile: holidaysMobileEs },
      pt: { desktop: holidaysPt, mobile: holidaysMobilePt },
      de: { desktop: holidaysDe, mobile: holidaysMobileDe }
    }
  }
}

/** The bundled hero artwork for a theme in the reader's language, or `null` when the theme ships none. */
export function campaignHeroArt(theme: CampaignTheme | null, locale: Locale): CampaignArt | null {
  const art = theme ? HERO_ART[theme] : undefined
  const images = art?.images[locale]
  return art && images ? { ...images, headlineKey: art.headlineKey } : null
}
