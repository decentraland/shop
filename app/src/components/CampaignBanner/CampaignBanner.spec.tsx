import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContentfulLocale } from '@dcl/schemas'
import type { BannerProps } from 'decentraland-ui2/dist/components/Banner'
import type { Campaign } from '~/lib/contentful'

let campaign: Campaign | undefined
vi.mock('~/hooks/useCampaign', () => ({
  useCampaign: () => ({ campaign, isPending: false })
}))

let iap = false
vi.mock('~/lib/iap', () => ({ isIapMode: () => iap }))

const tracked: Array<[string, Record<string, unknown>]> = []
vi.mock('~/lib/analytics', () => ({
  track: (event: string, props: Record<string, unknown>) => tracked.push([event, props])
}))

// The real banner is ui2's (MUI), mounted through a CssVarsProvider and a rich-text renderer. Stubbed so
// this spec is about what the SHOP decides — which slot renders, what the CTA does inside the web view,
// what the click reports — rather than about ui2's layout, which its own suite covers.
vi.mock('decentraland-ui2/dist/components/Banner', () => ({
  Banner: ({ fields, locale, onClick }: BannerProps) => (
    <div data-testid="ui2-banner" data-locale={locale} data-cta={String(fields?.showButton?.[ContentfulLocale.enUS])}>
      <button type="button" onClick={onClick}>
        {fields?.desktopTitle?.[locale ?? ContentfulLocale.enUS]}
      </button>
    </div>
  )
}))
vi.mock('@mui/material/styles', () => ({
  Experimental_CssVarsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))
vi.mock('decentraland-ui2/dist/theme', () => ({ light: {} }))

import { CampaignBanner } from './CampaignBanner'

const HOME_SLOT = 'marketplaceHomepageBanner'

function aCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    name: 'Halloween 2026',
    tabName: { [ContentfulLocale.enUS]: 'Halloween' },
    mainTag: 'halloween',
    tags: ['halloween'],
    banners: {
      [HOME_SLOT]: {
        id: 'banner-1',
        desktopTitle: { [ContentfulLocale.enUS]: 'Halloween is here', [ContentfulLocale.es]: 'Llegó Halloween' },
        showButton: { [ContentfulLocale.enUS]: true }
      } as Campaign['banners'][string]
    },
    assets: {},
    ...over
  }
}

describe('CampaignBanner', () => {
  beforeEach(() => {
    campaign = aCampaign()
    iap = false
    tracked.length = 0
  })

  describe('when the slot holds a banner', () => {
    it('should render it', async () => {
      render(<CampaignBanner slot={HOME_SLOT} />)
      expect(await screen.findByTestId('campaign-banner')).toBeInTheDocument()
    })

    it('should render it in the reader’s language', async () => {
      render(<CampaignBanner slot={HOME_SLOT} />)
      // English is the store's default; the Spanish path is covered by lib/contentful's locale merge.
      expect(await screen.findByTestId('ui2-banner')).toHaveAttribute('data-locale', ContentfulLocale.enUS)
    })

    it('should report the click with the slot it came from', async () => {
      render(<CampaignBanner slot={HOME_SLOT} />)
      await userEvent.click(await screen.findByRole('button'))
      expect(tracked).toEqual([
        ['Shop Clicked Banner', { slot: HOME_SLOT, banner_id: 'banner-1', campaign: 'Halloween 2026' }]
      ])
    })
  })

  describe('when there is no banner to show', () => {
    it('should render nothing without a campaign', () => {
      campaign = undefined
      const { container } = render(<CampaignBanner slot={HOME_SLOT} />)
      expect(container).toBeEmptyDOMElement()
    })

    it('should render nothing for a slot the cms does not fill', () => {
      const { container } = render(<CampaignBanner slot="somethingElse" />)
      // No skeleton either: reserving 300px for something that usually does not exist would push the
      // page's real content down on every cold load.
      expect(container).toBeEmptyDOMElement()
    })
  })

  describe('when running inside the ios web view', () => {
    it('should keep the artwork but drop the call to action', async () => {
      // The CTA's destination is a Contentful field shared with the Marketplace, and it most often points
      // at buying credits — which the Shop may not sell there.
      iap = true
      render(<CampaignBanner slot={HOME_SLOT} />)
      expect(await screen.findByTestId('ui2-banner')).toHaveAttribute('data-cta', 'false')
    })

    it('should leave the call to action alone everywhere else', async () => {
      render(<CampaignBanner slot={HOME_SLOT} />)
      expect(await screen.findByTestId('ui2-banner')).toHaveAttribute('data-cta', 'true')
    })

    it('should not mutate the cached campaign while dropping it', async () => {
      // The campaign object is react-query's cached value, shared by every surface reading this hook.
      // Editing the banner in place would switch the CTA off for all of them, and survive a route change.
      iap = true
      const cached = campaign!.banners[HOME_SLOT]
      render(<CampaignBanner slot={HOME_SLOT} />)
      await screen.findByTestId('ui2-banner')
      expect(cached.showButton[ContentfulLocale.enUS]).toBe(true)
    })
  })
})
