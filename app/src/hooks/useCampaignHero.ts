import { useMemo } from 'react'
import { ContentfulLocale } from '@dcl/schemas'

import { useCampaign } from '~/hooks/useCampaign'
import { assetUrl, localized, toContentfulLocale } from '~/lib/contentful'
import { useLocale } from '~/store/locale'

export type CampaignHero = {
  /** Headline, in the reader's language. */
  title: string
  /** The wide artwork, and the phone composition. */
  desktopImage: string
  mobileImage: string
  /** The banner's call to action, or `null` when the campaign ships none. */
  cta: { label: string; href: string } | null
  /** Identifiers for the click event. */
  bannerId: string
  campaignName: string | null
}

/**
 * The running campaign's takeover of a hero slot, or `null` when there is nothing to take it over with.
 *
 * The Shop's home hero is a fixed piece of art, copy and CTA compiled into the bundle, so changing it
 * means a deploy. This lets a campaign supply the same four things from the CMS instead — into the SAME
 * markup and styles, so a seasonal takeover is the existing hero with different contents rather than a
 * second banner stacked above it.
 *
 * `null` is the normal state and every caller falls back to its own defaults, so the Shop's own hero is
 * what shows whenever there is no campaign, the CMS is unreachable, or the feature is switched off.
 *
 * Fields the hero has no room for are deliberately ignored: the rich-text body, the alignment fields, the
 * logo, and `mobileTitle` (this hero has shown one headline at both sizes since it was built). An editor
 * filling those in Contentful will not see them here.
 */
export function useCampaignHero(slot: string): CampaignHero | null {
  const locale = useLocale(s => s.locale)
  const { campaign } = useCampaign()

  return useMemo(() => {
    const banner = campaign?.banners[slot]
    if (!banner || !campaign) return null

    const contentfulLocale = toContentfulLocale(locale)
    // The ARTWORK is picked per locale, not just the copy around it. A campaign's headline is usually
    // lettering baked into the image rather than a font we could set, so the translated banner is a
    // different file, and reading only the English one would show every Spanish reader English art.
    // `localized` falls back to English, so a campaign that ships one image still works everywhere.
    const desktopImage = assetUrl(campaign.assets, localized(banner.fullSizeBackground, contentfulLocale))
    // A hero with no artwork is not a hero — it would paint the bare `#14161b` backdrop with a headline on
    // it. Falling back to the Shop's own is better than shipping that.
    if (!desktopImage) return null

    // The phone frame is a different composition, not a crop, so a campaign that ships only the wide
    // artwork gets it at both sizes rather than nothing on mobile.
    const mobileImage = assetUrl(campaign.assets, localized(banner.mobileBackground, contentfulLocale)) || desktopImage

    // The same three conditions ui2's own banner applies, read under the same keys: the switch and the
    // destination are single-valued, only the label is translated.
    const wantsButton = banner.showButton?.[ContentfulLocale.enUS] === true
    const href = banner.buttonLink?.[ContentfulLocale.enUS]
    const label = localized(banner.buttonsText, contentfulLocale)

    return {
      title: localized(banner.desktopTitle, contentfulLocale) ?? '',
      desktopImage,
      mobileImage,
      cta: wantsButton && href && label ? { href, label } : null,
      bannerId: banner.id,
      campaignName: campaign.name
    }
  }, [campaign, slot, locale])
}
