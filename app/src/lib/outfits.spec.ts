import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'
import type { CatalogItem } from '~/lib/api'

const { signedFetch } = vi.hoisted(() => ({ signedFetch: vi.fn() }))
vi.mock('decentraland-crypto-fetch', () => ({ default: signedFetch }))

const { config } = vi.hoisted(() => ({ config: { shopServerUrl: '' } }))
vi.mock('~/config', () => ({ config }))

import {
  DEFAULT_OUTFIT_GRADIENT,
  OutfitsError,
  classifyOutfitItem,
  deleteOutfit,
  fetchAllOutfits,
  fetchOutfit,
  fetchOutfits,
  isHexColor,
  outfitFade,
  isListingUnavailable,
  isOutfitsAvailable,
  outfitErrorKey,
  outfitGradient,
  outfitRadialGradient,
  outfitItemKey,
  saveOutfit,
  splitOutfitItems,
  thumbnailUrl,
  toggleOutfitItem,
  uploadThumbnail,
  type Outfit,
  type OutfitDraft,
  type OutfitItemRef
} from '~/lib/outfits'

const IDENTITY = {} as AuthIdentity
const fetchMock = vi.fn()

const OUTFIT: Outfit = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  name: 'Neon Rebel',
  thumbnailHash: 'f'.repeat(64),
  items: [{ contractAddress: '0x' + 'a'.repeat(40), itemId: '0' }],
  bodyShape: 'female',
  gradientFrom: '#a855f7',
  gradientTo: '#e0219a',
  authorAddress: '0x' + 'b'.repeat(40),
  published: true,
  createdAt: 1,
  updatedAt: 1
}

const DRAFT: OutfitDraft = {
  id: OUTFIT.id,
  name: OUTFIT.name,
  thumbnailHash: OUTFIT.thumbnailHash,
  items: OUTFIT.items,
  bodyShape: OUTFIT.bodyShape,
  gradientFrom: OUTFIT.gradientFrom,
  gradientTo: OUTFIT.gradientTo,
  published: false
}

function ok(json: unknown) {
  return { ok: true, status: 200, json: async () => json }
}
function coded(status: number, error: string) {
  return { ok: false, status, json: async () => ({ ok: false, error }) }
}
// What a static SPA host answers for a path it doesn't implement: 200, but HTML rather than JSON.
function indexHtml() {
  return {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0')
    }
  }
}

beforeEach(() => {
  signedFetch.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  config.shopServerUrl = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('when no shop-server host is configured', () => {
  it('should report the feature as unavailable', () => {
    expect(isOutfitsAvailable()).toBe(false)
  })

  it('should list no outfits without any request — the app origin is not the outfits API', async () => {
    await expect(fetchOutfits()).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should resolve a single outfit to null without any request', async () => {
    await expect(fetchOutfit(OUTFIT.id)).resolves.toBeNull()
  })

  it('should refuse writes rather than fake a success it cannot store', async () => {
    await expect(saveOutfit(DRAFT, IDENTITY, 'create')).rejects.toThrow(/no shop-server host/i)
    await expect(deleteOutfit(OUTFIT.id, IDENTITY)).rejects.toThrow(/no shop-server host/i)
    await expect(uploadThumbnail(new Blob(['x']), IDENTITY)).rejects.toThrow(/no shop-server host/i)
    await expect(fetchAllOutfits(IDENTITY)).rejects.toThrow(/no shop-server host/i)
    expect(signedFetch).not.toHaveBeenCalled()
  })
})

describe('when a shop-server host is configured', () => {
  beforeEach(() => {
    config.shopServerUrl = 'https://shop.example'
  })

  it('should report the feature as available', () => {
    expect(isOutfitsAvailable()).toBe(true)
  })

  describe('and listing published outfits', () => {
    it('should GET the public endpoint unsigned', async () => {
      fetchMock.mockResolvedValueOnce(ok({ outfits: [OUTFIT] }))
      await expect(fetchOutfits()).resolves.toEqual([OUTFIT])
      expect(fetchMock).toHaveBeenCalledWith('https://shop.example/v1/outfits')
      expect(signedFetch).not.toHaveBeenCalled()
    })

    it('should treat a 200 that is not JSON as the failure it is (SPA host trap)', async () => {
      fetchMock.mockResolvedValueOnce(indexHtml())
      await expect(fetchOutfits()).rejects.toThrow(/not JSON/)
    })

    it('should surface the server error code on failure', async () => {
      fetchMock.mockResolvedValueOnce(coded(500, 'Internal server error'))
      await expect(fetchOutfits()).rejects.toMatchObject({ code: 'Internal server error' })
    })
  })

  describe('and listing the authoring view', () => {
    it('should GET /v1/outfits/all via signed fetch', async () => {
      signedFetch.mockResolvedValueOnce(ok({ outfits: [OUTFIT] }))
      await expect(fetchAllOutfits(IDENTITY)).resolves.toEqual([OUTFIT])
      const [url, init] = signedFetch.mock.calls[0]
      expect(url).toBe('https://shop.example/v1/outfits/all')
      expect(init).toMatchObject({ method: 'GET', identity: IDENTITY })
    })

    it('should carry the not_allowed code when the signer is off the allowlist', async () => {
      signedFetch.mockResolvedValueOnce(coded(403, 'not_allowed'))
      await expect(fetchAllOutfits(IDENTITY)).rejects.toMatchObject({ code: 'not_allowed' })
    })
  })

  describe('and fetching one outfit', () => {
    it('should use plain fetch when unsigned and return the outfit', async () => {
      fetchMock.mockResolvedValueOnce(ok({ outfit: OUTFIT }))
      await expect(fetchOutfit(OUTFIT.id)).resolves.toEqual(OUTFIT)
      expect(fetchMock).toHaveBeenCalledWith(`https://shop.example/v1/outfits/${OUTFIT.id}`)
    })

    it('should sign the request when an identity is provided (drafts)', async () => {
      signedFetch.mockResolvedValueOnce(ok({ outfit: OUTFIT }))
      await expect(fetchOutfit(OUTFIT.id, IDENTITY)).resolves.toEqual(OUTFIT)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should resolve null on 404 rather than throwing', async () => {
      fetchMock.mockResolvedValueOnce(coded(404, 'not_found'))
      await expect(fetchOutfit('nope')).resolves.toBeNull()
    })
  })

  describe('and saving an outfit', () => {
    it('should POST on create with the draft as JSON body', async () => {
      signedFetch.mockResolvedValueOnce(ok({ outfit: OUTFIT }))
      await expect(saveOutfit(DRAFT, IDENTITY, 'create')).resolves.toEqual(OUTFIT)
      const [url, init] = signedFetch.mock.calls[0]
      expect(url).toBe('https://shop.example/v1/outfits')
      expect(init).toMatchObject({ method: 'POST' })
      expect(JSON.parse(init.body as string)).toEqual(DRAFT)
    })

    it('should PUT to the outfit id on update', async () => {
      signedFetch.mockResolvedValueOnce(ok({ outfit: OUTFIT }))
      await saveOutfit(DRAFT, IDENTITY, 'update')
      const [url, init] = signedFetch.mock.calls[0]
      expect(url).toBe(`https://shop.example/v1/outfits/${OUTFIT.id}`)
      expect(init).toMatchObject({ method: 'PUT' })
    })

    it('should throw an OutfitsError carrying the server code', async () => {
      signedFetch.mockResolvedValueOnce(coded(400, 'not_publishable'))
      const failure = await saveOutfit(DRAFT, IDENTITY, 'create').catch((e: unknown) => e)
      expect(failure).toBeInstanceOf(OutfitsError)
      expect((failure as OutfitsError).code).toBe('not_publishable')
    })
  })

  describe('and uploading a thumbnail', () => {
    it('should POST the raw blob and return the hash', async () => {
      signedFetch.mockResolvedValueOnce(ok({ hash: 'c'.repeat(64) }))
      const image = new Blob(['png-bytes'])
      await expect(uploadThumbnail(image, IDENTITY)).resolves.toBe('c'.repeat(64))
      const [url, init] = signedFetch.mock.calls[0]
      expect(url).toBe('https://shop.example/v1/outfits/thumbnails')
      expect(init).toMatchObject({ method: 'POST', body: image })
    })

    it('should carry the too_large / unsupported_type codes', async () => {
      signedFetch.mockResolvedValueOnce(coded(413, 'too_large'))
      await expect(uploadThumbnail(new Blob(['x']), IDENTITY)).rejects.toMatchObject({ code: 'too_large' })
    })
  })

  describe('and deleting an outfit', () => {
    it('should DELETE by id via signed fetch', async () => {
      signedFetch.mockResolvedValueOnce(ok({ ok: true }))
      await deleteOutfit(OUTFIT.id, IDENTITY)
      const [url, init] = signedFetch.mock.calls[0]
      expect(url).toBe(`https://shop.example/v1/outfits/${OUTFIT.id}`)
      expect(init).toMatchObject({ method: 'DELETE' })
    })
  })

  it('should build immutable thumbnail URLs from the hash', () => {
    expect(thumbnailUrl('c'.repeat(64))).toBe(`https://shop.example/v1/outfits/thumbnails/${'c'.repeat(64)}`)
  })
})

describe('when deriving item keys', () => {
  it('should lowercase the contract and join with the item id', () => {
    expect(outfitItemKey({ contractAddress: '0x' + 'AB'.repeat(20), itemId: '7' })).toBe(`0x${'ab'.repeat(20)}-7`)
  })
})

describe('when mapping error codes to copy', () => {
  it.each([
    ['not_allowed', 'outfits.errors.notAllowed'],
    ['not_publishable', 'outfits.errors.notPublishable'],
    ['invalid_items', 'outfits.errors.invalidItems'],
    ['too_large', 'outfits.errors.tooLarge'],
    ['unsupported_type', 'outfits.errors.unsupportedType'],
    ['not_found', 'outfits.errors.notFound']
  ])('should map %s to %s', (code, key) => {
    expect(outfitErrorKey(code)).toBe(key)
  })

  it('should fall back to the generic key for unknown codes', () => {
    expect(outfitErrorKey('http_500')).toBe('outfits.errors.generic')
    expect(outfitErrorKey(undefined)).toBe('outfits.errors.generic')
  })
})

describe('when classifying resolved items', () => {
  const OWNER = '0x' + 'd'.repeat(40)

  function item(overrides: Partial<CatalogItem>): CatalogItem {
    return {
      id: 'key-1',
      name: 'Hat',
      creator: '0x' + 'e'.repeat(40),
      contractAddress: '0x' + 'a'.repeat(40),
      itemId: '1',
      category: 'wearable',
      rarity: 'rare',
      network: 'MATIC',
      chainId: 80002,
      thumbnail: '',
      priceCredits: 10,
      gender: null,
      isSmart: false,
      ...overrides
    }
  }

  const NO_CART = new Set<string>()

  it('should mark unpriced items unavailable', () => {
    expect(isListingUnavailable(item({ priceCredits: 0 }))).toBe(true)
    expect(classifyOutfitItem(item({ priceCredits: 0 }), { cartIds: NO_CART })).toBe('unavailable')
  })

  it('should mark sold-out primaries unavailable even though they keep a listed price', () => {
    expect(isListingUnavailable(item({ available: 0 }))).toBe(true)
  })

  it('should never apply the stock rule to secondary listings (a token has no supply)', () => {
    expect(isListingUnavailable(item({ tokenId: '42', available: 0 }))).toBe(false)
  })

  it('should keep primaries with unknown stock buyable', () => {
    expect(isListingUnavailable(item({ available: undefined }))).toBe(false)
  })

  it("should mark the viewer's own primary listing", () => {
    const own = item({ creator: OWNER })
    expect(classifyOutfitItem(own, { address: OWNER, cartIds: NO_CART })).toBe('own_listing')
  })

  it('should mark items already in the cart by line id', () => {
    expect(classifyOutfitItem(item({}), { cartIds: new Set(['key-1']) })).toBe('in_cart')
  })

  it('should rank unavailability above cart membership (a dead line is dead)', () => {
    expect(classifyOutfitItem(item({ priceCredits: 0 }), { cartIds: new Set(['key-1']) })).toBe('unavailable')
  })

  it('should split a mixed set by state', () => {
    const split = splitOutfitItems(
      [item({ id: 'a' }), item({ id: 'b', priceCredits: 0 }), item({ id: 'c', creator: OWNER }), item({ id: 'd' })],
      { address: OWNER, cartIds: new Set(['d']) }
    )
    expect(split.purchasable.map(i => i.id)).toEqual(['a'])
    expect(split.unavailable.map(i => i.id)).toEqual(['b'])
    expect(split.ownListing.map(i => i.id)).toEqual(['c'])
    expect(split.inCart.map(i => i.id)).toEqual(['d'])
  })
})

describe('when toggling items in the studio selection', () => {
  const CONTRACT = '0x' + 'a'.repeat(40)

  function catalogItem(overrides: Partial<CatalogItem>): CatalogItem {
    return {
      id: 'trade-1',
      name: 'Hat',
      creator: '0x' + 'e'.repeat(40),
      contractAddress: CONTRACT,
      itemId: '1',
      category: 'wearable',
      wearableCategory: 'hat',
      rarity: 'rare',
      network: 'MATIC',
      chainId: 80002,
      thumbnail: '',
      priceCredits: 10,
      gender: null,
      isSmart: false,
      ...overrides
    }
  }

  function ref(itemId: string): OutfitItemRef {
    return { contractAddress: CONTRACT, itemId }
  }

  it('should append a new item and lowercase its contract', () => {
    const picked = catalogItem({ contractAddress: CONTRACT.toUpperCase().replace('0X', '0x'), itemId: '7' })
    const next = toggleOutfitItem([ref('1')], picked, new Map())
    expect(next).toEqual([ref('1'), ref('7')])
  })

  it('should remove an item already in the selection (toggle off), matching by pair not by trade id', () => {
    const picked = catalogItem({ id: 'trade-9', itemId: '1' })
    expect(toggleOutfitItem([ref('1'), ref('2')], picked, new Map())).toEqual([ref('2')])
  })

  it('should swap out a resolved item occupying the same slot', () => {
    const worn = catalogItem({ id: `${CONTRACT}-1`, itemId: '1', wearableCategory: 'upper_body' })
    const picked = catalogItem({ id: 'trade-2', itemId: '2', wearableCategory: 'upper_body' })
    const resolved = new Map([[outfitItemKey(ref('1')), worn]])
    expect(toggleOutfitItem([ref('1'), ref('3')], picked, resolved)).toEqual([ref('3'), ref('2')])
  })

  it('should keep unresolved refs (their slot is unknown, so they never conflict)', () => {
    const picked = catalogItem({ itemId: '2', wearableCategory: 'upper_body' })
    expect(toggleOutfitItem([ref('1')], picked, new Map())).toEqual([ref('1'), ref('2')])
  })

  it('should ignore items with no itemId (a secondary token cannot be referenced)', () => {
    const picked = catalogItem({ itemId: null })
    expect(toggleOutfitItem([ref('1')], picked, new Map())).toEqual([ref('1')])
  })
})

describe('when building the backdrop gradient', () => {
  it('should blend the creator colors from top to bottom', () => {
    expect(outfitGradient({ gradientFrom: '#a855f7', gradientTo: '#e0219a' })).toBe(
      'linear-gradient(180deg, #a855f7 0%, #e0219a 100%)'
    )
  })

  it('should build the detail radial glow with the BOTTOM color at the centre', () => {
    expect(outfitRadialGradient({ gradientFrom: '#a855f7', gradientTo: '#e0219a' })).toBe(
      'radial-gradient(circle, #e0219a 0%, #a855f7 100%)'
    )
    // Same per-stop fallback as the linear blend — a half-filled draft still renders.
    expect(outfitRadialGradient({ gradientFrom: '', gradientTo: '#e0219a' })).toContain(DEFAULT_OUTFIT_GRADIENT.from)
  })

  // A half-filled draft must not emit a broken `linear-gradient`, so each stop falls back on its own.
  it.each([
    ['both missing', { gradientFrom: '', gradientTo: '' }],
    ['start missing', { gradientFrom: '', gradientTo: '#e0219a' }],
    ['malformed start', { gradientFrom: 'not-a-color', gradientTo: '#e0219a' }],
    ['short hex', { gradientFrom: '#abc', gradientTo: '#e0219a' }]
  ])('should fall back to the brand color for %s', (_label, outfit) => {
    expect(outfitGradient(outfit)).toContain(DEFAULT_OUTFIT_GRADIENT.from)
  })

  it('should keep a valid stop when only the other one is missing', () => {
    expect(outfitGradient({ gradientFrom: '#a855f7', gradientTo: '' })).toBe(
      `linear-gradient(180deg, #a855f7 0%, ${DEFAULT_OUTFIT_GRADIENT.to} 100%)`
    )
  })

  it('should accept only 6-digit hex colors', () => {
    expect(isHexColor('#a855f7')).toBe(true)
    expect(isHexColor('#A855F7')).toBe(true)
    expect(isHexColor('#abc')).toBe(false)
    expect(isHexColor('a855f7')).toBe(false)
    expect(isHexColor('')).toBe(false)
  })
})

describe('when deriving the bottom fade', () => {
  it('should ramp the bottom color from transparent to 80% opacity', () => {
    expect(outfitFade({ gradientFrom: '#a855f7', gradientTo: '#e0219a' })).toBe(
      'linear-gradient(180deg, rgba(224, 33, 154, 0) 0%, rgba(224, 33, 154, 0.8) 100%)'
    )
  })

  it('should derive from the BOTTOM stop, not the top one', () => {
    expect(outfitFade({ gradientFrom: '#ffffff', gradientTo: '#000000' })).toContain('rgba(0, 0, 0, 0.8)')
  })

  it('should fall back to the brand bottom color when the stop is unusable', () => {
    // #691fa9 → 105, 31, 169
    expect(outfitFade({ gradientFrom: '#a855f7', gradientTo: '' })).toContain('rgba(105, 31, 169, 0.8)')
  })
})
