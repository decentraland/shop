import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContentfulLocale } from '@dcl/schemas'

import { config } from '~/config'
import {
  assetUrl,
  fetchCampaign,
  isContentfulConfigured,
  localized,
  optimizeAssetUrl,
  toContentfulLocale
} from '~/lib/contentful'

const ADMIN_ID = config.contentfulAdminEntityId
const BANNER_ID = 'banner-entry-1'
const HOME_SLOT = 'marketplaceHomepageBanner'
const CAMPAIGN_ID = 'campaign-entry-1'
const DESKTOP_ASSET_ID = 'asset-desktop'
const MOBILE_ASSET_ID = 'asset-mobile'

const link = (id: string, linkType: 'Entry' | 'Asset') => ({ sys: { type: 'Link', linkType, id } })

const adminEntry = (locale: ContentfulLocale) => ({
  sys: { id: ADMIN_ID, type: 'Entry', contentType: { sys: { id: 'admin' } } },
  metadata: { tags: [], concepts: [] },
  fields: {
    name: locale === ContentfulLocale.es ? 'Entrada admin' : 'Master admin entry',
    campaign: link(CAMPAIGN_ID, 'Entry'),
    marketplaceHomepageBanner: link(BANNER_ID, 'Entry'),
    marketplaceCampaignCollectiblesBanner: link(BANNER_ID, 'Entry')
  }
})

const bannerEntry = (locale: ContentfulLocale) => ({
  sys: { id: BANNER_ID, type: 'Entry', contentType: { sys: { id: 'banner' } } },
  metadata: { tags: [], concepts: [] },
  fields: {
    desktopTitle: locale === ContentfulLocale.es ? 'Noche de brujas' : 'Halloween is here',
    mobileTitle: locale === ContentfulLocale.es ? 'Noche de brujas' : 'Halloween is here',
    showButton: true,
    buttonLink: 'https://decentraland.org/shop/event',
    fullSizeBackground: link(DESKTOP_ASSET_ID, 'Asset'),
    mobileBackground: link(MOBILE_ASSET_ID, 'Asset')
  }
})

const campaignEntry = (locale: ContentfulLocale) => ({
  sys: { id: CAMPAIGN_ID, type: 'Entry', contentType: { sys: { id: 'marketingCampaign' } } },
  metadata: { tags: [], concepts: [] },
  fields: {
    name: 'Halloween 2026',
    mainTag: 'halloween',
    additionalTags: ['spooky', 'Halloween'],
    marketplaceTabName: locale === ContentfulLocale.es ? 'Halloween' : 'Halloween'
  }
})

const asset = (id: string) => ({
  sys: { id, type: 'Asset' },
  metadata: { tags: [], concepts: [] },
  fields: {
    title: id,
    description: '',
    file: {
      url: `//images.ctfassets.net/space/${id}.png`,
      details: { size: 1, image: { width: 1280, height: 300 } },
      fileName: `${id}.png`,
      contentType: 'image/png'
    }
  }
})

/** Routes a request to the right canned entry/asset, the way the CMS proxy would. */
function mockCms(overrides: { entries?: Record<string, unknown>; failing?: string[] } = {}) {
  const calls: string[] = []
  const fetchMock = vi.fn((input: string) => {
    const url = String(input)
    calls.push(url)
    const locale = url.includes(`locale=${ContentfulLocale.es}`) ? ContentfulLocale.es : ContentfulLocale.enUS
    const byId: Record<string, unknown> = {
      [ADMIN_ID]: adminEntry(locale),
      [BANNER_ID]: bannerEntry(locale),
      [CAMPAIGN_ID]: campaignEntry(locale),
      [DESKTOP_ASSET_ID]: asset(DESKTOP_ASSET_ID),
      [MOBILE_ASSET_ID]: asset(MOBILE_ASSET_ID),
      ...(overrides.entries ?? {})
    }
    const id = Object.keys(byId).find(key => url.includes(key))
    if (!id || overrides.failing?.some(failed => url.includes(failed))) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(byId[id]) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, calls }
}

describe('contentful', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('when resolving the environment locale', () => {
    it('should map the shop locales onto contentful spellings', () => {
      expect(toContentfulLocale('es')).toBe(ContentfulLocale.es)
      expect(toContentfulLocale('en')).toBe(ContentfulLocale.enUS)
    })
  })

  describe('when reading a localized field', () => {
    it('should return the requested locale when it is translated', () => {
      expect(
        localized({ [ContentfulLocale.enUS]: 'Hat', [ContentfulLocale.es]: 'Sombrero' }, ContentfulLocale.es)
      ).toBe('Sombrero')
    })

    it('should fall back to english for an untranslated field', () => {
      // A half-translated campaign is normal: an editor publishes the English copy first. A Spanish reader
      // must see English rather than a blank banner.
      expect(localized({ [ContentfulLocale.enUS]: 'Hat' }, ContentfulLocale.es)).toBe('Hat')
    })

    it('should return undefined for an absent field', () => {
      expect(localized(undefined, ContentfulLocale.enUS)).toBeUndefined()
    })
  })

  describe('when optimizing an asset url', () => {
    it('should move the asset onto the decentraland image proxy', () => {
      // Contentful's own host is not in the deployed CSP, so an un-rewritten URL is a blocked request.
      expect(optimizeAssetUrl('//images.ctfassets.net/space/a.png')).toMatch(
        /^https:\/\/cms-images\.decentraland\.org\/space\/a\.png\?/
      )
    })

    it('should ask the proxy for a compressed copy', () => {
      expect(optimizeAssetUrl('https://images.ctfassets.net/space/a.png')).toContain('q=80')
    })

    it('should ask for webp on the formats that benefit from it', () => {
      // Banner artwork is authored as a 1280px PNG, which `q` does not compress at all, and it loads on
      // the eager home route.
      expect(optimizeAssetUrl('https://images.ctfassets.net/space/a.png')).toContain('fm=webp')
      expect(optimizeAssetUrl('https://images.ctfassets.net/space/a.gif')).not.toContain('fm=')
    })

    it('should leave a malformed url untouched rather than throwing', () => {
      expect(optimizeAssetUrl('not a url')).toBe('not a url')
    })
  })

  describe('when resolving a linked asset', () => {
    // The shape `fetchCampaign` HANDS OUT (localized, url already rewritten), not the flat one the CDN
    // returns — this helper reads the resolved campaign, not a raw response.
    const assets = {
      a1: {
        sys: { id: 'a1', type: 'Asset' },
        metadata: { tags: [], concepts: [] },
        fields: { file: { [ContentfulLocale.enUS]: { url: 'https://cms-images.decentraland.org/a1.png?q=80' } } }
      }
    } as unknown as Parameters<typeof assetUrl>[0]
    const link = { sys: { type: 'Link', linkType: 'Asset', id: 'a1' } } as Parameters<typeof assetUrl>[1]

    it('should return the stored url', () => {
      expect(assetUrl(assets, link)).toBe('https://cms-images.decentraland.org/a1.png?q=80')
    })

    it('should return nothing for an absent link', () => {
      expect(assetUrl(assets, undefined)).toBe('')
    })

    it('should return nothing when the asset is not in the map', () => {
      // `fetchCampaign` drops an asset it could not fetch rather than failing the campaign, so a link can
      // outlive the asset it points at. The caller decides what to do with "no artwork".
      expect(assetUrl({}, link)).toBe('')
    })

    it('should make a protocol-relative url absolute', () => {
      const relative = {
        a1: {
          sys: { id: 'a1', type: 'Asset' },
          metadata: { tags: [], concepts: [] },
          fields: { file: { [ContentfulLocale.enUS]: { url: '//cms-images.decentraland.org/a1.png' } } }
        }
      } as unknown as Parameters<typeof assetUrl>[0]

      expect(assetUrl(relative, link)).toBe('https://cms-images.decentraland.org/a1.png')
    })
  })

  describe('when the environment has a cms configured', () => {
    it('should consider itself configured', () => {
      expect(isContentfulConfigured()).toBe(true)
    })
  })

  describe('when fetching the campaign', () => {
    it('should key each banner by the admin field it hangs off', async () => {
      mockCms()
      const campaign = await fetchCampaign()
      // Two slots legitimately point at ONE banner entry — that is how production is configured today — so
      // the key has to be the slot, not the entry id.
      expect(Object.keys(campaign!.banners).sort()).toEqual([
        'marketplaceCampaignCollectiblesBanner',
        'marketplaceHomepageBanner'
      ])
      expect(campaign!.banners[HOME_SLOT].id).toBe(BANNER_ID)
    })

    it('should not mistake the campaign entry for a banner', async () => {
      mockCms()
      const campaign = await fetchCampaign()
      expect(campaign!.banners.campaign).toBeUndefined()
    })

    it('should merge the locales into one localized field', async () => {
      mockCms()
      const campaign = await fetchCampaign()
      const title = campaign!.banners[HOME_SLOT].desktopTitle
      expect(title[ContentfulLocale.enUS]).toBe('Halloween is here')
      expect(title[ContentfulLocale.es]).toBe('Noche de brujas')
    })

    it('should expose the campaign tag and tab label', async () => {
      mockCms()
      const campaign = await fetchCampaign()
      expect(campaign!.mainTag).toBe('halloween')
      expect(localized(campaign!.tabName, ContentfulLocale.enUS)).toBe('Halloween')
    })

    it('should de-duplicate the tags case-insensitively', async () => {
      mockCms()
      const campaign = await fetchCampaign()
      // Builder tag lookup is case-insensitive, so `Halloween` and `halloween` are one query.
      expect(campaign!.tags).toEqual(['halloween', 'spooky'])
    })

    it('should resolve every linked asset through the image proxy', async () => {
      mockCms()
      const campaign = await fetchCampaign()
      const url = campaign!.assets[DESKTOP_ASSET_ID].fields.file[ContentfulLocale.enUS].url
      expect(url).toContain('cms-images.decentraland.org')
    })

    it('should carry the artwork dimensions ui2 sizes the banner from', async () => {
      mockCms()
      const campaign = await fetchCampaign()
      expect(campaign!.assets[DESKTOP_ASSET_ID].fields.file[ContentfulLocale.enUS].details.image).toEqual({
        width: 1280,
        height: 300
      })
    })

    it('should report no tag when there is no campaign entry', async () => {
      // Production has run for months with banners configured and no campaign — the banners must still
      // resolve, and only the event tab is withheld.
      const adminWithoutCampaign = (locale: ContentfulLocale) => {
        const entry = adminEntry(locale) as { fields: Record<string, unknown> }
        delete entry.fields.campaign
        return entry
      }
      vi.stubGlobal(
        'fetch',
        vi.fn((input: string) => {
          const url = String(input)
          const locale = url.includes(`locale=${ContentfulLocale.es}`) ? ContentfulLocale.es : ContentfulLocale.enUS
          const byId: Record<string, unknown> = {
            [ADMIN_ID]: adminWithoutCampaign(locale),
            [BANNER_ID]: bannerEntry(locale),
            [DESKTOP_ASSET_ID]: asset(DESKTOP_ASSET_ID),
            [MOBILE_ASSET_ID]: asset(MOBILE_ASSET_ID)
          }
          const id = Object.keys(byId).find(key => url.includes(key))
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(byId[id!]) })
        })
      )
      const campaign = await fetchCampaign()
      expect(campaign!.mainTag).toBeNull()
      expect(campaign!.tags).toEqual([])
      expect(Object.keys(campaign!.banners)).toContain('marketplaceHomepageBanner')
    })

    it('should fill in the banner fields ui2 reads without guarding them', async () => {
      // ui2's <Banner> does `fields.desktopTitleAlignment['en-US']` with no optional chaining, and
      // Contentful omits a field entirely when the editor leaves it empty — the fixture above leaves the
      // alignments out on purpose. Unfilled, one of them throws inside the banner and the error boundary
      // swallows the whole surface.
      mockCms()
      const campaign = await fetchCampaign()
      const banner = campaign!.banners[HOME_SLOT]
      for (const key of ['desktopTitleAlignment', 'mobileTextAlignment', 'desktopButtonAlignment'] as const) {
        expect(banner[key]).toBeDefined()
        expect(banner[key][ContentfulLocale.enUS]).toBeUndefined()
      }
    })

    it('should backfill an untranslated field with english', async () => {
      // ui2 indexes `fields.showButton[locale]` directly rather than through a fallback helper, so a field
      // the editor translated only in English would otherwise render blank for a Spanish reader.
      mockCms()
      const campaign = await fetchCampaign()
      expect(campaign!.banners[HOME_SLOT].buttonLink?.[ContentfulLocale.es]).toBe('https://decentraland.org/shop/event')
    })

    it('should lose one unpublished asset rather than the whole campaign', async () => {
      mockCms({ failing: [MOBILE_ASSET_ID] })
      const campaign = await fetchCampaign()
      expect(campaign!.assets[DESKTOP_ASSET_ID]).toBeDefined()
      expect(campaign!.assets[MOBILE_ASSET_ID]).toBeUndefined()
      expect(campaign!.banners[HOME_SLOT]).toBeDefined()
    })

    it('should throw when the cms is unreachable', async () => {
      // Swallowing this would make "the CMS is down" indistinguishable from "there is no campaign", and
      // react-query could not retry it.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) }))
      await expect(fetchCampaign()).rejects.toThrow(/503/)
    })
  })
})
