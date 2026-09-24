import { useCampaignHero } from '~/hooks/useCampaignHero'
import { track } from '~/lib/analytics'
import { isIapMode } from '~/lib/iap'
import * as S from './CampaignBanner.styles'

/**
 * The running event's banner, from the CMS slot named by `slot`.
 *
 * Renders nothing when that slot is empty, so a campaign that ships no artwork simply has no banner —
 * unlike the home hero, this surface has no default of its own to fall back to.
 */
export function CampaignBanner({ slot }: { slot: string }) {
  const banner = useCampaignHero(slot)

  if (!banner) return null

  return (
    <S.Banner
      data-testid="campaign-banner"
      // The blurred filler behind the artwork reads its URL from here; see the styles for why it exists.
      // Desktop only — the mobile asset is square and fills its box, so nothing needs filling there.
      style={{ ['--banner-art' as string]: `url(${banner.desktopImage})` }}
    >
      <picture>
        <source media="(max-width: 768px)" srcSet={banner.mobileImage} />
        <S.Bg src={banner.desktopImage} alt="" aria-hidden />
      </picture>
      <S.Inner>
        <S.Title data-testid="campaign-banner-title">{banner.title}</S.Title>
        {/* Hidden in the iOS web view for the same reason the home hero's is: the destination is free text
            an editor typed, and a drop most often points at buying something. */}
        {!isIapMode() && banner.cta ? (
          <S.Cta
            as="a"
            href={banner.cta.href}
            variant="purple"
            data-testid="campaign-banner-cta"
            onClick={() =>
              track('Shop Clicked Banner', { slot, banner_id: banner.bannerId, campaign: banner.campaignName })
            }
          >
            {banner.cta.label}
          </S.Cta>
        ) : null}
      </S.Inner>
    </S.Banner>
  )
}
