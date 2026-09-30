import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ContentfulLocale } from '@dcl/schemas'
import type { Campaign } from '~/lib/contentful'

const { useCampaign } = vi.hoisted(() => ({ useCampaign: vi.fn() }))
vi.mock('~/hooks/useCampaign', () => ({ useCampaign }))

import { useCampaignHero } from './useCampaignHero'
import { useLocale } from '~/store/locale'

const SLOT = 'marketplaceHomepageBanner'
const DESKTOP = 'desktop-asset'
const MOBILE = 'mobile-asset'

const assetLink = (id: string) => ({ sys: { type: 'Link', linkType: 'Asset', id } })

function asset(id: string, url: string) {
  return {
    sys: { id, type: 'Asset' },
    metadata: { tags: [], concepts: [] },
    fields: {
      title: { [ContentfulLocale.enUS]: id },
      description: { [ContentfulLocale.enUS]: '' },
      file: { [ContentfulLocale.enUS]: { url, details: { size: 1, image: { width: 1280, height: 300 } } } }
    }
  }
}

/** A campaign shaped the way `fetchCampaign` returns one — both locales filled, as the backfill leaves them. */
function aCampaign(bannerOverrides: Record<string, unknown> = {}, assets?: Record<string, unknown>): Campaign {
  return {
    name: 'Halloween 2026',
    tabName: { [ContentfulLocale.enUS]: 'Halloween' },
    mainTag: 'halloween',
    tags: ['halloween'],
    collections: [],
    items: [],
    banners: {
      [SLOT]: {
        id: 'banner-1',
        desktopTitle: { [ContentfulLocale.enUS]: 'Halloween is here', [ContentfulLocale.es]: 'Llegó Halloween' },
        fullSizeBackground: { [ContentfulLocale.enUS]: assetLink(DESKTOP) },
        mobileBackground: { [ContentfulLocale.enUS]: assetLink(MOBILE) },
        showButton: { [ContentfulLocale.enUS]: true },
        buttonLink: { [ContentfulLocale.enUS]: 'https://decentraland.org/shop/event' },
        buttonsText: { [ContentfulLocale.enUS]: 'Shop the drop', [ContentfulLocale.es]: 'Ver la colección' },
        ...bannerOverrides
      }
    } as unknown as Campaign['banners'],
    assets: (assets ?? {
      [DESKTOP]: asset(DESKTOP, 'https://cms-images.decentraland.org/wide.png'),
      [MOBILE]: asset(MOBILE, 'https://cms-images.decentraland.org/square.png')
    }) as unknown as Campaign['assets']
  }
}

const withCampaign = (campaign: Campaign | undefined) =>
  useCampaign.mockReturnValue({ campaign, isPending: false, isError: false })

beforeEach(() => {
  vi.clearAllMocks()
  useLocale.setState({ locale: 'en' })
  withCampaign(undefined)
})

describe('useCampaignHero', () => {
  describe('when no campaign is running', () => {
    it('should hand back nothing, so the caller keeps its own hero', () => {
      expect(renderHook(() => useCampaignHero(SLOT)).result.current).toBeNull()
    })
  })

  describe('when a campaign fills the slot', () => {
    it('should expose its headline and both artworks', () => {
      withCampaign(aCampaign())

      const hero = renderHook(() => useCampaignHero(SLOT)).result.current

      expect(hero).toMatchObject({
        title: 'Halloween is here',
        desktopImage: 'https://cms-images.decentraland.org/wide.png',
        mobileImage: 'https://cms-images.decentraland.org/square.png',
        bannerId: 'banner-1',
        campaignName: 'Halloween 2026'
      })
    })

    it('should translate the headline and the button label', () => {
      withCampaign(aCampaign())
      useLocale.setState({ locale: 'es' })

      const hero = renderHook(() => useCampaignHero(SLOT)).result.current

      expect(hero?.title).toBe('Llegó Halloween')
      expect(hero?.cta?.label).toBe('Ver la colección')
    })

    it('should serve the TRANSLATED artwork, not just the translated copy', () => {
      // A campaign's headline is usually lettering baked into the image rather than a font we could set,
      // so the Spanish banner is a different file. Reading only the English link would show every Spanish
      // reader English art with Spanish copy laid over it.
      withCampaign(
        aCampaign(
          {
            fullSizeBackground: {
              [ContentfulLocale.enUS]: assetLink(DESKTOP),
              [ContentfulLocale.es]: assetLink('desktop-es')
            },
            mobileBackground: {
              [ContentfulLocale.enUS]: assetLink(MOBILE),
              [ContentfulLocale.es]: assetLink('mobile-es')
            }
          },
          {
            [DESKTOP]: asset(DESKTOP, 'https://cms-images.decentraland.org/wide.png'),
            [MOBILE]: asset(MOBILE, 'https://cms-images.decentraland.org/square.png'),
            'desktop-es': asset('desktop-es', 'https://cms-images.decentraland.org/wide-es.png'),
            'mobile-es': asset('mobile-es', 'https://cms-images.decentraland.org/square-es.png')
          }
        )
      )
      useLocale.setState({ locale: 'es' })

      const hero = renderHook(() => useCampaignHero(SLOT)).result.current

      expect(hero?.desktopImage).toBe('https://cms-images.decentraland.org/wide-es.png')
      expect(hero?.mobileImage).toBe('https://cms-images.decentraland.org/square-es.png')
    })

    it('should fall back to the English artwork for a campaign that ships only one', () => {
      // The common case, and the one that must not regress: most campaigns never translate the image.
      withCampaign(aCampaign())
      useLocale.setState({ locale: 'es' })

      const hero = renderHook(() => useCampaignHero(SLOT)).result.current

      expect(hero?.desktopImage).toBe('https://cms-images.decentraland.org/wide.png')
      expect(hero?.mobileImage).toBe('https://cms-images.decentraland.org/square.png')
    })

    it('should reuse the wide artwork on mobile when the campaign ships only one', () => {
      // The phone frame is a different composition, not a crop — but one artwork everywhere beats none.
      withCampaign(aCampaign({ mobileBackground: undefined }))

      const hero = renderHook(() => useCampaignHero(SLOT)).result.current

      expect(hero?.mobileImage).toBe('https://cms-images.decentraland.org/wide.png')
    })

    it('should give up the takeover when the artwork is missing', () => {
      // Without art the hero would paint its bare backdrop with a headline on it. The Shop's own is better.
      withCampaign(aCampaign({ fullSizeBackground: undefined }))

      expect(renderHook(() => useCampaignHero(SLOT)).result.current).toBeNull()
    })

    it('should give up the takeover when the artwork failed to load', () => {
      // `fetchCampaign` drops an asset it could not fetch rather than failing the whole campaign, so the
      // link can outlive the asset it points at.
      withCampaign(aCampaign({}, {}))

      expect(renderHook(() => useCampaignHero(SLOT)).result.current).toBeNull()
    })

    it('should offer nothing for a slot the campaign does not fill', () => {
      withCampaign(aCampaign())

      expect(renderHook(() => useCampaignHero('someOtherSlot')).result.current).toBeNull()
    })
  })

  describe('and the campaign carries a call to action', () => {
    it('should expose its label and destination', () => {
      withCampaign(aCampaign())

      expect(renderHook(() => useCampaignHero(SLOT)).result.current?.cta).toEqual({
        label: 'Shop the drop',
        href: 'https://decentraland.org/shop/event'
      })
    })

    it.each([
      ['the editor switched the button off', { showButton: { [ContentfulLocale.enUS]: false } }],
      ['there is no destination', { buttonLink: undefined }],
      ['there is no label', { buttonsText: undefined }]
    ])('should expose no call to action when %s', (_why, overrides) => {
      withCampaign(aCampaign(overrides))

      expect(renderHook(() => useCampaignHero(SLOT)).result.current?.cta).toBeNull()
    })
  })
})
