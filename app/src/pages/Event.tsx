import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useCampaign } from '~/hooks/useCampaign'
import { useCampaignContracts } from '~/hooks/useCampaignContracts'
import { localized, toContentfulLocale } from '~/lib/contentful'
import { useLocale } from '~/store/locale'
import { Assets } from '~/pages/Assets'
import { CampaignBanner } from '~/components/CampaignBanner'
import { t } from '~/intl/i18n'

/**
 * The seasonal event's storefront: the ordinary collectibles grid, pinned to the collections the campaign
 * selected.
 *
 * It is the SAME grid rather than a copy of it — filters, chips, sorting, infinite scroll and the cards
 * themselves all come from `Assets`, which takes the collection set as a prop. Three of that page's
 * defaults have to be overridden for this surface, and each one is a trap rather than a preference:
 *
 * - The SEO, because `Assets` sets its own and a page that set the title and then rendered the grid would
 *   be overwritten by it.
 * - The Status filter, pinned to on-sale. Left alone, typing in the search box flips it to "everything",
 *   which silently swaps the buyable grid for the view-only one.
 * - NAMEs, dropped. A NAME is a separate purchase and can never belong to a collection set — and without
 *   dropping it, `?category=names` would render the NAMEs page inside the event.
 *
 * When the campaign ends the entry is unpublished, this page's reason to exist goes with it, and anyone
 * standing here (or arriving from a shared link) is sent to the ordinary grid.
 */
// The slot the Marketplace uses above its own campaign grid.
const CAMPAIGN_BANNER_SLOT = 'marketplaceCampaignCollectiblesBanner'

export function Event() {
  const navigate = useNavigate()
  const locale = useLocale(s => s.locale)
  const { campaign, isPending: campaignPending } = useCampaign()
  const { contracts, isPending: contractsPending } = useCampaignContracts(campaign?.tags ?? [], campaign?.collections)

  const gone = !campaignPending && !campaign?.mainTag

  useEffect(() => {
    // Only once the answer is actually known. `isPending` covers the feature-flag read as well as the CMS
    // one, which is what stops this bouncing every visitor off the page on a cold load.
    if (gone) navigate('/items', { replace: true })
  }, [gone, navigate])

  if (campaignPending || contractsPending || gone) {
    return (
      <div className="page-loading" aria-busy="true">
        <span className="spinner" aria-hidden />
      </div>
    )
  }

  const name = localized(campaign?.tabName, toContentfulLocale(locale)) ?? campaign?.name ?? ''

  return (
    <>
      {/* The same slot the Marketplace puts above its own campaign grid, so the two stay in step. */}
      <CampaignBanner slot={CAMPAIGN_BANNER_SLOT} />
      <Assets
        contracts={contracts}
        itemIds={campaign?.items}
        hideNames
        lockStatus="on_sale"
        seo={{
          title: name || t('seo.collectibles.title'),
          description: t('seo.collectibles.description'),
          // Live for a few weeks a year and gone the rest of it, so it is kept out of the index rather
          // than left to go stale there — and out of public/sitemap.xml, whose header forbids noindex URLs.
          noindex: true
        }}
      />
    </>
  )
}
