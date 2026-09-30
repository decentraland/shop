import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { useCampaignHero } = vi.hoisted(() => ({ useCampaignHero: vi.fn() }))
vi.mock('~/hooks/useCampaignHero', () => ({ useCampaignHero }))

let iap = false
vi.mock('~/lib/iap', () => ({ isIapMode: () => iap }))

const tracked: Array<[string, Record<string, unknown>]> = []
vi.mock('~/lib/analytics', () => ({ track: (e: string, p: Record<string, unknown>) => tracked.push([e, p]) }))

import { CampaignBanner } from './CampaignBanner'

const SLOT = 'marketplaceCampaignCollectiblesBanner'

const banner = {
  title: 'Halloween is here',
  desktopImage: 'https://cms-images.decentraland.org/wide.png',
  mobileImage: 'https://cms-images.decentraland.org/square.png',
  cta: { label: 'Shop the drop', href: 'https://decentraland.org/shop/event' },
  bannerId: 'banner-1',
  campaignName: 'Halloween 2026'
}

beforeEach(() => {
  vi.clearAllMocks()
  iap = false
  tracked.length = 0
  useCampaignHero.mockReturnValue(banner)
})

describe('CampaignBanner', () => {
  it('should ask for the slot it was given', () => {
    render(<CampaignBanner slot={SLOT} />)

    expect(useCampaignHero).toHaveBeenCalledWith(SLOT)
  })

  it('should draw no heading when the campaign ships no title', () => {
    // Its headline lives in the artwork as lettering, so the CMS field is blank on purpose. An empty
    // heading would still hold the space above the CTA.
    useCampaignHero.mockReturnValue({ ...banner, title: '' })

    const { queryByTestId } = render(<CampaignBanner slot={SLOT} />)

    expect(queryByTestId('campaign-banner-title')).toBeNull()
  })

  it('should show the campaign headline and artwork', () => {
    const { getByTestId, container } = render(<CampaignBanner slot={SLOT} />)

    expect(getByTestId('campaign-banner-title').textContent).toBe('Halloween is here')
    expect(container.querySelector('picture img')).toHaveAttribute('src', banner.desktopImage)
    expect(container.querySelector('picture source')).toHaveAttribute('srcset', banner.mobileImage)
  })

  it('should report a click on its call to action', async () => {
    const { getByTestId } = render(<CampaignBanner slot={SLOT} />)

    await userEvent.click(getByTestId('campaign-banner-cta'))

    expect(tracked).toEqual([
      ['Shop Clicked Banner', { slot: SLOT, banner_id: 'banner-1', campaign: 'Halloween 2026' }]
    ])
  })

  it('should render nothing when the slot is empty', () => {
    // Unlike the home hero, this surface has no default of its own to fall back to.
    useCampaignHero.mockReturnValue(null)

    const { container } = render(<CampaignBanner slot={SLOT} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('should keep the artwork but drop the call to action inside the ios web view', () => {
    iap = true

    const { queryByTestId, getByTestId } = render(<CampaignBanner slot={SLOT} />)

    expect(getByTestId('campaign-banner-title')).toBeInTheDocument()
    expect(queryByTestId('campaign-banner-cta')).not.toBeInTheDocument()
  })

  it('should show no call to action when the campaign ships none', () => {
    useCampaignHero.mockReturnValue({ ...banner, cta: null })

    const { queryByTestId } = render(<CampaignBanner slot={SLOT} />)

    expect(queryByTestId('campaign-banner-cta')).not.toBeInTheDocument()
  })
})
