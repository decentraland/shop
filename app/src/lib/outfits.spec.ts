import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'
import type { CatalogItem } from '~/lib/api'

const { signedFetch } = vi.hoisted(() => ({ signedFetch: vi.fn() }))
vi.mock('decentraland-crypto-fetch', () => ({ default: signedFetch }))

const { config } = vi.hoisted(() => ({ config: { shopServerUrl: '' } }))
vi.mock('~/config', () => ({ config }))

// The only thing lib/outfits pulls from lib/api at runtime: the shop-feed read that turns an outfit
// ref into the row a cart line is actually built from.
const { fetchShopItems } = vi.hoisted(() => ({ fetchShopItems: vi.fn() }))
vi.mock('~/lib/api', () => ({ fetchShopItems }))

import {
  DEFAULT_OUTFIT_GRADIENT,
  MAX_OUTFIT_ITEMS,
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
  listingIdentity,
  outfitErrorKey,
  outfitGradient,
  outfitRadialGradient,
  outfitItemKey,
  parseOutfitImport,
  resolveOutfitPurchases,
  saveOutfit,
  splitOutfitItems,
  isBuyableFromCreator,
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

  // The server applies the same shape before it serves the bytes, so a value that could not pass
  // there is never built into a URL here — a draft's '' most of all, which would otherwise produce
  // a trailing-slash URL and an <img> pointed at it.
  it('should refuse to build a URL from anything that is not a stored hash', () => {
    expect(thumbnailUrl('')).toBeNull()
    expect(thumbnailUrl('../../etc/passwd')).toBeNull()
    expect(thumbnailUrl('C'.repeat(64))).toBeNull()
    expect(thumbnailUrl('c'.repeat(63))).toBeNull()
    expect(thumbnailUrl('c'.repeat(65))).toBeNull()
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
  const CONTRACT = '0x' + 'a'.repeat(40)
  /** The identity the default factory item resolves to — what a cart line for it keys under. */
  const KEY = `${CONTRACT}-1`

  function item(overrides: Partial<CatalogItem>): CatalogItem {
    return {
      id: 'key-1',
      name: 'Hat',
      creator: '0x' + 'e'.repeat(40),
      contractAddress: CONTRACT,
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
    expect(classifyOutfitItem(item({ priceCredits: 0 }), { cartKeys: NO_CART })).toBe('unavailable')
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
    expect(classifyOutfitItem(own, { address: OWNER, cartKeys: NO_CART })).toBe('own_listing')
  })

  it('should mark items already in the cart', () => {
    expect(classifyOutfitItem(item({}), { cartKeys: new Set([KEY]) })).toBe('in_cart')
  })

  // The whole point of keying on the identity rather than the row id: the browse grid stores a cart
  // line under its TRADE id, an outfit resolves the same wearable off the /v2 catalog under
  // `contract-itemId`, and "already in your cart" has to hold across that seam.
  it('should recognise a cart line added from another feed (different row id, same listing)', () => {
    const fromOutfitFeed = item({ id: `${CONTRACT}-1` })
    const fromBrowseGrid = item({ id: 'trade-0xdeadbeef' })
    expect(listingIdentity(fromBrowseGrid)).toBe(listingIdentity(fromOutfitFeed))
    expect(classifyOutfitItem(fromOutfitFeed, { cartKeys: new Set([listingIdentity(fromBrowseGrid)]) })).toBe('in_cart')
  })

  it('should key a specific token separately from its item (a resale is its own listing)', () => {
    expect(listingIdentity(item({ tokenId: '42' }))).not.toBe(listingIdentity(item({})))
  })

  it('should rank unavailability above cart membership (a dead line is dead)', () => {
    expect(classifyOutfitItem(item({ priceCredits: 0 }), { cartKeys: new Set([KEY]) })).toBe('unavailable')
  })

  it('should split a mixed set by state', () => {
    const split = splitOutfitItems(
      [
        item({ id: 'a', itemId: '1' }),
        item({ id: 'b', itemId: '2', priceCredits: 0 }),
        item({ id: 'c', itemId: '3', creator: OWNER }),
        item({ id: 'd', itemId: '4' })
      ],
      { address: OWNER, cartKeys: new Set([`${CONTRACT}-4`]) }
    )
    expect(split.purchasable.map(i => i.id)).toEqual(['a'])
    expect(split.unavailable.map(i => i.id)).toEqual(['b'])
    expect(split.ownListing.map(i => i.id)).toEqual(['c'])
    expect(split.inCart.map(i => i.id)).toEqual(['d'])
  })

  // The discovery row's admission test: buyable FROM THE CREATOR, whatever the reason it might not be.
  describe('isBuyableFromCreator', () => {
    const live = { available: 100, hasPrimaryListing: true }

    it('admits a live mint with supply left', () => {
      expect(isBuyableFromCreator(item({ ...live }))).toBe(true)
    })

    it('rejects a sold-out mint even though it keeps its listed price', () => {
      expect(isBuyableFromCreator(item({ ...live, available: 0 }))).toBe(false)
    })

    it('rejects a resale-only item — the creator is no longer the seller', () => {
      expect(isBuyableFromCreator(item({ available: 0, hasPrimaryListing: false }))).toBe(false)
      // Supply left but the mint is closed: still not the creator's to sell.
      expect(isBuyableFromCreator(item({ available: 5, hasPrimaryListing: false }))).toBe(false)
    })

    it('rejects an unpriced item', () => {
      expect(isBuyableFromCreator(item({ ...live, priceCredits: 0 }))).toBe(false)
    })

    // A feed that never answers the question must not be read as a yes: an over-strict row costs a
    // card, an under-strict one walks the shopper into a look they cannot complete.
    it('rejects a row that reports neither supply nor seller', () => {
      expect(isBuyableFromCreator(item({}))).toBe(false)
    })
  })

  // An emote is an ordinary outfit item: same states, same purchasable filter, counted in the CTA.
  it('should classify an emote exactly like a wearable', () => {
    const emote = item({ id: 'e', itemId: '5', category: 'emote' })
    expect(classifyOutfitItem(emote, { cartKeys: NO_CART })).toBe('purchasable')
    expect(
      classifyOutfitItem(item({ id: 'e', itemId: '5', category: 'emote', available: 0 }), { cartKeys: NO_CART })
    ).toBe('unavailable')
    const split = splitOutfitItems([item({ id: 'a', itemId: '1' }), emote], { cartKeys: NO_CART })
    expect(split.purchasable.map(i => i.id)).toEqual(['a', 'e'])
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

  // Emotes occupy no avatar slot, so they only ever add to a look — they never take a wearable off.
  it('should append an emote without displacing any wearable', () => {
    const worn = catalogItem({ id: `${CONTRACT}-1`, itemId: '1', wearableCategory: 'upper_body' })
    const emote = catalogItem({ id: 'trade-e', itemId: '9', category: 'emote', wearableCategory: 'dance' })
    const resolved = new Map([[outfitItemKey(ref('1')), worn]])
    expect(toggleOutfitItem([ref('1')], emote, resolved)).toEqual([ref('1'), ref('9')])
  })

  it('should let several emotes coexist', () => {
    const first = catalogItem({ id: `${CONTRACT}-9`, itemId: '9', category: 'emote', wearableCategory: 'dance' })
    const second = catalogItem({ id: 'trade-e2', itemId: '10', category: 'emote', wearableCategory: 'fun' })
    const resolved = new Map([[outfitItemKey(ref('9')), first]])
    expect(toggleOutfitItem([ref('9')], second, resolved)).toEqual([ref('9'), ref('10')])
  })
})

describe('when building the backdrop gradient', () => {
  // Figma 2090:402143 fills the card with a centred radial flare, not a vertical band: the geometry comes
  // off its gradientTransform (radii 224.16 x 156.52 on a 340.5 x 237.75 box = 65.83% a side) and the
  // BOTTOM stop is the core.
  it('should blend the creator colors as a centred radial flare', () => {
    expect(outfitGradient({ gradientFrom: '#a855f7', gradientTo: '#e0219a' })).toBe(
      'radial-gradient(65.83% 65.83% at 50% 50%, #e0219a 0%, #a855f7 100%)'
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
      `radial-gradient(65.83% 65.83% at 50% 50%, ${DEFAULT_OUTFIT_GRADIENT.to} 0%, #a855f7 100%)`
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

describe('when importing from an avatar-preview link', () => {
  const SAMPLE =
    '?mode=builder&bodyShape=urn:decentraland:off-chain:base-avatars:BaseFemale' +
    '&urn=urn:decentraland:matic:collections-v2:0xf370aea38d9f4462236807b68d20c57fc814e1e9:0' +
    '&urn=urn:decentraland:matic:collections-v2:0x6da6f4de96c5d6b797a4df9865f8a5dd1e9fd341:0' +
    '&urn=urn:decentraland:matic:collections-v2:0x08de0de733cc11081d43569b809c00e6ddf314fb:1' +
    '&urn=urn:decentraland:matic:collections-v2:0xae0aa900fbdbb8a96f1d136d43b6a8ab3555af4d:1' +
    '&urn=urn:decentraland:matic:collections-v2:0xda2cfda208b9abbd6f8771f52cda1355e384d3ff:0' +
    '&urn=urn:decentraland:matic:collections-v2:0xde65a3172c400187b65960f47b11f88ff98b9979:0' +
    '&skinColor=D9A486&hairColor=D4D4D4&eyeColor=3B240D&emote=../OutfitStudio/Poses/Pose_13'

  it('should extract every item pair, the body shape and the colors from a builder string', () => {
    const parsed = parseOutfitImport(SAMPLE)!
    expect(parsed.items).toHaveLength(6)
    expect(parsed.items[0]).toEqual({ contractAddress: '0xf370aea38d9f4462236807b68d20c57fc814e1e9', itemId: '0' })
    expect(parsed.bodyShape).toBe('female')
    expect(parsed.colors).toEqual({ skin: 'd9a486', hair: 'd4d4d4', eyes: '3b240d' })
  })

  it('should accept a full URL, not just the query string', () => {
    const parsed = parseOutfitImport(`https://wearable-preview.decentraland.org/${SAMPLE}`)
    expect(parsed?.items).toHaveLength(6)
  })

  it('should import a listed emote from the emote param', () => {
    const parsed = parseOutfitImport(
      'urn=urn:decentraland:matic:collections-v2:0x' +
        'a'.repeat(40) +
        ':0' +
        '&emote=urn:decentraland:matic:collections-v2:0x' +
        'b'.repeat(40) +
        ':3'
    )!
    expect(parsed.items).toEqual([
      { contractAddress: '0x' + 'a'.repeat(40), itemId: '0' },
      { contractAddress: '0x' + 'b'.repeat(40), itemId: '3' }
    ])
  })

  it('should ignore a builder-local emote path', () => {
    expect(parseOutfitImport(SAMPLE)!.items).toHaveLength(6)
  })

  it('should dedupe repeated pairs and skip non-item urns', () => {
    const parsed = parseOutfitImport(
      'urn=urn:decentraland:off-chain:base-avatars:eyebrows_00' +
        '&urn=urn:decentraland:matic:collections-v2:0x' +
        'a'.repeat(40) +
        ':7' +
        '&urn=urn:decentraland:matic:collections-v2:0x' +
        'A'.repeat(40) +
        ':7'
    )!
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0].contractAddress).toBe('0x' + 'a'.repeat(40))
  })

  it('should cap the import at the outfit item limit', () => {
    const urns = Array.from(
      { length: MAX_OUTFIT_ITEMS + 2 },
      (_, i) => `urn=urn:decentraland:matic:collections-v2:0x${String(i).padStart(40, '0')}:0`
    ).join('&')
    expect(parseOutfitImport(urns)?.items).toHaveLength(MAX_OUTFIT_ITEMS)
  })

  it('should return null when nothing usable is in the string', () => {
    expect(parseOutfitImport('mode=builder&emote=wave')).toBeNull()
    expect(parseOutfitImport('complete garbage')).toBeNull()
    expect(parseOutfitImport('')).toBeNull()
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

// The seam this whole path exists for: what a card SHOWS comes from the /v2 catalog, what enters the
// cart is re-read here from the shop feed, because only the latter carries `acquisition` (which rail
// checkout takes) and `available` (whether a mint has anything left).
describe('when resolving an outfit for the cart', () => {
  const CONTRACT = '0x' + 'a'.repeat(40)
  const REFS: OutfitItemRef[] = [
    { contractAddress: CONTRACT, itemId: '1' },
    { contractAddress: CONTRACT, itemId: '2' }
  ]

  function listing(overrides: Partial<CatalogItem>): CatalogItem {
    return {
      id: 'trade-1',
      name: 'Hat',
      creator: '0x' + 'e'.repeat(40),
      contractAddress: CONTRACT,
      itemId: '1',
      category: 'wearable',
      rarity: 'rare',
      network: 'MATIC',
      chainId: 80002,
      thumbnail: '',
      priceCredits: 10,
      gender: null,
      isSmart: false,
      available: 5,
      ...overrides
    }
  }

  beforeEach(() => {
    fetchShopItems.mockReset()
  })

  it('should key each resolved listing by its outfit ref', async () => {
    fetchShopItems
      .mockResolvedValueOnce({ items: [listing({ itemId: '1', id: 'trade-1' })], total: 1 })
      .mockResolvedValueOnce({ items: [listing({ itemId: '2', id: 'trade-2' })], total: 1 })

    const live = await resolveOutfitPurchases(REFS)

    expect([...live.keys()]).toEqual([`${CONTRACT}-1`, `${CONTRACT}-2`])
    // The row that goes in the cart is the SHOP feed's, trade id and all — not the /v2 catalog row.
    expect(live.get(`${CONTRACT}-1`)?.id).toBe('trade-1')
  })

  it('should scope the read to the one item, not the whole feed', async () => {
    fetchShopItems.mockResolvedValue({ items: [listing({})], total: 1 })
    await resolveOutfitPurchases([REFS[0]])
    expect(fetchShopItems).toHaveBeenCalledWith(
      expect.objectContaining({ contractAddress: CONTRACT, itemId: '1', first: 1 })
    )
  })

  // Authoring is primary-only; shopping is not. A look whose jacket minted out but is still resold
  // stays buyable, and at the resale price the /v2 row already priced the card with.
  it('should keep an item that is now only available as a resale', async () => {
    fetchShopItems.mockResolvedValue({
      items: [listing({ tokenId: '7', available: undefined, priceCredits: 135 })],
      total: 1
    })
    const live = await resolveOutfitPurchases([REFS[0]])
    expect(live.get(`${CONTRACT}-1`)?.tokenId).toBe('7')
  })

  it('should drop a ref the shop feed no longer sells', async () => {
    fetchShopItems
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [listing({ itemId: '2' })], total: 1 })

    const live = await resolveOutfitPurchases(REFS)

    expect([...live.keys()]).toEqual([`${CONTRACT}-2`])
  })

  // The case the /v2 catalog cannot see at all: a mint that kept its price but has nothing left.
  it('should drop a minted-out primary even though it still carries a price', async () => {
    fetchShopItems
      .mockResolvedValueOnce({ items: [listing({ itemId: '1', available: 0 })], total: 1 })
      .mockResolvedValueOnce({ items: [listing({ itemId: '2' })], total: 1 })

    const live = await resolveOutfitPurchases(REFS)

    expect([...live.keys()]).toEqual([`${CONTRACT}-2`])
  })

  // An outage is not a sell-out. Rejecting is what lets the caller retry instead of quietly building
  // a short basket and telling the buyer their look partly sold out.
  it('should propagate a read failure rather than report the items as gone', async () => {
    fetchShopItems.mockRejectedValueOnce(new Error('gateway down'))
    fetchShopItems.mockResolvedValue({ items: [listing({})], total: 1 })

    await expect(resolveOutfitPurchases(REFS)).rejects.toThrow('gateway down')
  })
})
