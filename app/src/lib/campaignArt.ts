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

export type CampaignArt = { desktop: string; mobile: string }

/**
 * Hero artwork a theme ships in the bundle, one pair per locale because the headline is lettering inside the
 * image. Typed over every `Locale`, so adding a language without its artwork fails to compile.
 */
const HERO_ART: Partial<Record<CampaignTheme, Record<Locale, CampaignArt>>> = {
  holidays: {
    en: { desktop: holidaysEn, mobile: holidaysMobileEn },
    es: { desktop: holidaysEs, mobile: holidaysMobileEs },
    pt: { desktop: holidaysPt, mobile: holidaysMobilePt },
    de: { desktop: holidaysDe, mobile: holidaysMobileDe }
  }
}

/** The bundled hero artwork for a theme in the reader's language, or `null` when the theme ships none. */
export function campaignHeroArt(theme: CampaignTheme | null, locale: Locale): CampaignArt | null {
  if (!theme) return null
  return HERO_ART[theme]?.[locale] ?? null
}
