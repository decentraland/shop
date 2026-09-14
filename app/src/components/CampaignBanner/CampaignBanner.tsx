import { lazy, Suspense, type ComponentProps } from 'react'
import * as Sentry from '@sentry/react'
import { ContentfulLocale } from '@dcl/schemas'
import type { Banner as BannerComponent } from 'decentraland-ui2/dist/components/Banner'
import { useCampaign } from '~/hooks/useCampaign'
import { toContentfulLocale, type CampaignBanner as CampaignBannerFields } from '~/lib/contentful'
import { useLocale } from '~/store/locale'
import { track } from '~/lib/analytics'
import { isIapMode } from '~/lib/iap'
import * as S from './CampaignBanner.styles'

/**
 * ui2's banner, behind the MUI theme it needs.
 *
 * Its styled parts read `theme.breakpoints`, and the Shop mounts no MUI/emotion ThemeProvider — so
 * without this the whole page throws, exactly as `LazyEmoteControls` documents for the emote controls.
 * `Experimental_CssVarsProvider` is the provider ui2's own DclThemeProvider uses; DclThemeProvider itself
 * is avoided because it also renders `CssBaseline`, whose global resets would clobber the Shop's CSS.
 *
 * Lazy so none of that machinery — MUI's theme, ui2's theme, the Contentful rich-text renderer ui2 pulls
 * for the banner body — lands in the chunk of whatever route mounts this. The home route is eager, so
 * that is the difference between a marketing banner and a slower first paint for everyone.
 */
const LazyBanner = lazy(async () => {
  const [{ Banner }, { Experimental_CssVarsProvider: CssVarsProvider }, { light: dclTheme }] = await Promise.all([
    import('decentraland-ui2/dist/components/Banner'),
    import('@mui/material/styles'),
    import('decentraland-ui2/dist/theme')
  ])
  return {
    default: (props: ComponentProps<typeof BannerComponent>) => (
      <CssVarsProvider theme={dclTheme}>
        <Banner {...props} />
      </CssVarsProvider>
    )
  }
})

type Props = {
  /**
   * The ADMIN entry field this banner hangs off — the slot, not the entry id. Two slots may point at one
   * banner entry, which is how production is configured today.
   */
  slot: string
}

/**
 * A marketing banner, authored in Contentful.
 *
 * Renders nothing at all when the feature is off, the CMS has no banner in this slot, or the read is
 * still in flight. There is no skeleton on purpose: a banner is decoration, and reserving a 300px-tall
 * placeholder for something that usually does not exist would push the page's real content down on every
 * cold load.
 */
export function CampaignBanner({ slot }: Props) {
  const locale = useLocale(s => s.locale)
  const { campaign } = useCampaign()
  const banner = campaign?.banners[slot]

  if (!banner) return null

  // Inside the iOS web view the CTA is dropped and the artwork kept. The button's destination is a single
  // Contentful field shared with the Marketplace, so nobody editing it is thinking about App Store review
  // — and it most often points at buying credits, which is the one thing the Shop may not sell there (the
  // same reason the home page hides its own credits CTA under isIapMode).
  const fields: CampaignBannerFields = isIapMode()
    ? { ...banner, showButton: { ...banner.showButton, [ContentfulLocale.enUS]: false } }
    : banner

  return (
    <Sentry.ErrorBoundary fallback={<></>}>
      <Suspense fallback={null}>
        <S.Shell data-testid="campaign-banner" data-slot={slot}>
          <LazyBanner
            fields={fields}
            assets={campaign.assets}
            isLoading={false}
            error={null}
            locale={toContentfulLocale(locale)}
            onClick={() => track('Shop Clicked Banner', { slot, banner_id: banner.id, campaign: campaign.name })}
          />
        </S.Shell>
      </Suspense>
    </Sentry.ErrorBoundary>
  )
}
