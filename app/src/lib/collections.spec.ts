import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'http://mps.test' } }))

import {
  fetchCollection,
  fetchCollectionItems,
  fetchCatalogItems,
  fetchCreatorItems,
  fetchCreatorCollections,
  sanitizeCollectionName
} from '~/lib/collections'

type RawItem = {
  id: string
  name: string
  price?: string | null
  tradeId?: string | null
  isOnSale?: boolean
  available?: string | number | null
  creator?: string
  contractAddress: string
  itemId?: string | null
  category: string
  rarity?: string
  network: string
  chainId: number
  thumbnail?: string
  urn?: string
  // Server-computed whole credits (asset-aware). The client no longer converts.
  priceCredits?: number
  data?: {
    wearable?: { category?: string; bodyShapes?: string[] }
    emote?: { category?: string }
  }
}

function rawItem(overrides: Partial<RawItem> = {}): RawItem {
  return {
    id: 'item-1',
    name: 'Cool Hat',
    creator: '0xcreator',
    contractAddress: '0xcollection',
    itemId: '7',
    category: 'wearable',
    rarity: 'epic',
    network: 'MATIC',
    chainId: 137,
    thumbnail: 'http://img.test/hat.png',
    urn: 'urn:decentraland:matic:collections-v2:0xcollection:7',
    priceCredits: 10,
    data: { wearable: { category: 'hat', bodyShapes: ['urn:BaseMale'] } },
    ...overrides
  }
}

function mockFetchOk(data: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function mockFetchNotOk(status: number) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// Restore the real global fetch so the stub never leaks into other spec files.
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('when fetching a collection carousel', () => {
  it('should call the /v3/catalog/items endpoint with the collection contract, default first and social-emotes excluded', async () => {
    const fetchMock = mockFetchOk([rawItem()])

    await fetchCollectionItems('0xcollection')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('http://mps.test/v3/catalog/items')
    expect(url.searchParams.get('contractAddress')).toBe('0xcollection')
    expect(url.searchParams.get('first')).toBe('20')
    expect(url.searchParams.get('includeSocialEmotes')).toBe('false')
  })

  it('and a custom first is passed it should forward it in the query string', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCollectionItems('0xcollection', { first: 5 })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('first')).toBe('5')
  })

  it('and browse filters are passed it should forward them in the query string', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCollectionItems('0xcollection', {
      category: 'emote',
      rarities: ['epic', 'legendary'],
      wearableCategories: ['dance', 'fun'],
      minPriceCredits: 5,
      maxPriceCredits: 50,
      sortBy: 'cheapest'
    })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('category')).toBe('emote')
    expect(url.searchParams.getAll('rarity')).toEqual(['epic', 'legendary'])
    expect(url.searchParams.getAll('wearableCategory')).toEqual(['dance', 'fun'])
    expect(url.searchParams.get('minPrice')).toBe('5')
    expect(url.searchParams.get('maxPrice')).toBe('50')
    expect(url.searchParams.get('sortBy')).toBe('cheapest')
  })

  it('and the category is "all" it should omit the category param', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCollectionItems('0xcollection', { category: 'all' })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.has('category')).toBe(false)
  })

  it('should map each raw item into a catalog item', async () => {
    mockFetchOk([rawItem()])

    const { items } = await fetchCollectionItems('0xcollection')

    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      id: 'item-1',
      name: 'Cool Hat',
      creator: '0xcreator',
      contractAddress: '0xcollection',
      itemId: '7',
      urn: 'urn:decentraland:matic:collections-v2:0xcollection:7',
      category: 'wearable',
      wearableCategory: 'hat',
      rarity: 'epic',
      isSmart: false,
      network: 'MATIC',
      chainId: 137,
      thumbnail: 'http://img.test/hat.png',
      priceCredits: 10,
      gender: 'male'
    })
  })

  it('and the data field is missing it should return an empty list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const { items } = await fetchCollectionItems('0xcollection')

    expect(items).toEqual([])
  })

  it('and the response is not ok it should throw with the status', async () => {
    mockFetchNotOk(503)

    await expect(fetchCollectionItems('0xcollection')).rejects.toThrow('fetchCollectionItems 503')
  })
})

describe('when fetching a creator storefront', () => {
  it('should call the /v3/catalog/items endpoint with the creator, default first and social-emotes excluded', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCreatorItems('0xartist')

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('http://mps.test/v3/catalog/items')
    expect(url.searchParams.get('creator')).toBe('0xartist')
    expect(url.searchParams.get('first')).toBe('60')
    expect(url.searchParams.get('includeSocialEmotes')).toBe('false')
    expect(url.searchParams.has('contractAddress')).toBe(false)
  })

  it('and a custom first is passed it should forward it in the query string', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCreatorItems('0xartist', { first: 12 })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('first')).toBe('12')
  })

  it('should map returned raw items into catalog items', async () => {
    mockFetchOk([rawItem({ id: 'a' }), rawItem({ id: 'b' })])

    const { items } = await fetchCreatorItems('0xartist')

    expect(items.map(i => i.id)).toEqual(['a', 'b'])
  })

  it('and the response is not ok it should throw with the status', async () => {
    mockFetchNotOk(404)

    await expect(fetchCreatorItems('0xartist')).rejects.toThrow('fetchCreatorItems 404')
  })
})

describe('when fetching a single collection by contract', () => {
  it('should query /v1/collections by contractAddress and return name + creator', async () => {
    const fetchMock = mockFetchOk([{ contractAddress: '0xabc', name: 'Black Dragon', creator: '0xartist' }])

    const meta = await fetchCollection('0xabc')

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('http://mps.test/v1/collections')
    expect(url.searchParams.get('contractAddress')).toBe('0xabc')
    expect(meta).toEqual({ contractAddress: '0xabc', name: 'Black Dragon', creator: '0xartist' })
  })

  it('should return null when the collection is not found', async () => {
    mockFetchOk([])

    expect(await fetchCollection('0xnope')).toBeNull()
  })

  it('should default a missing name/creator to empty strings', async () => {
    mockFetchOk([{ contractAddress: '0xabc' }])

    expect(await fetchCollection('0xabc')).toEqual({ contractAddress: '0xabc', name: '', creator: '' })
  })

  it('and the response is not ok it should throw with the status', async () => {
    mockFetchNotOk(500)

    await expect(fetchCollection('0xabc')).rejects.toThrow('fetchCollection 500')
  })

  it('should sanitize a dcl:// v1 collection name to a readable title', async () => {
    mockFetchOk([{ contractAddress: '0xv1', name: 'dcl://cybermike_cybersoldier_set', creator: '0xartist' }])

    const meta = await fetchCollection('0xv1')

    expect(meta).toEqual({ contractAddress: '0xv1', name: 'Cybermike Cybersoldier Set', creator: '0xartist' })
  })
})

describe('when fetching a creator’s published collections', () => {
  it('should query /v1/collections by creator, newest first, with paging forwarded', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCreatorCollections('0xArtist', { first: 12, skip: 24 })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('http://mps.test/v1/collections')
    expect(url.searchParams.get('creator')).toBe('0xArtist')
    expect(url.searchParams.get('sortBy')).toBe('newest')
    expect(url.searchParams.get('first')).toBe('12')
    expect(url.searchParams.get('skip')).toBe('24')
  })

  it('should map each collection to meta + item count (from `size`)', async () => {
    mockFetchOk([
      { contractAddress: '0xc1', name: 'Soul Magic', creator: '0xartist', size: 250 },
      { contractAddress: '0xc2', name: 'Neon Dreams', creator: '0xartist', size: 3 }
    ])

    const { collections } = await fetchCreatorCollections('0xartist')

    expect(collections).toEqual([
      { contractAddress: '0xc1', name: 'Soul Magic', creator: '0xartist', itemCount: 250 },
      { contractAddress: '0xc2', name: 'Neon Dreams', creator: '0xartist', itemCount: 3 }
    ])
  })

  it('should default a missing name/creator/size', async () => {
    mockFetchOk([{ contractAddress: '0xc1' }])

    const { collections } = await fetchCreatorCollections('0xartist')

    expect(collections[0]).toEqual({ contractAddress: '0xc1', name: '', creator: '', itemCount: 0 })
  })

  it('should use the response total when present', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ contractAddress: '0xc1', size: 1 }], total: 42 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { total } = await fetchCreatorCollections('0xartist')

    expect(total).toBe(42)
  })

  it('and no total is returned it should fall back to skip + length', async () => {
    mockFetchOk([{ contractAddress: '0xc1' }, { contractAddress: '0xc2' }])

    const { total } = await fetchCreatorCollections('0xartist', { skip: 10 })

    expect(total).toBe(12)
  })

  it('and the response is not ok it should throw with the status', async () => {
    mockFetchNotOk(500)

    await expect(fetchCreatorCollections('0xartist')).rejects.toThrow('fetchCreatorCollections 500')
  })

  it('should sanitize dcl:// v1 collection names to readable titles', async () => {
    mockFetchOk([{ contractAddress: '0xv1', name: 'dcl://rac_basics', creator: '0xartist', size: 5 }])

    const { collections } = await fetchCreatorCollections('0xartist')

    expect(collections[0].name).toBe('Rac Basics')
  })
})

describe('when consuming the server-computed credit price', () => {
  it('should pass through the server priceCredits verbatim (no client conversion)', async () => {
    mockFetchOk([rawItem({ priceCredits: 13 })])

    const { items } = await fetchCollectionItems('0xcollection')

    expect(items[0].priceCredits).toBe(13)
  })

  it('and the item is not for sale (priceCredits absent) it should be zero credits', async () => {
    mockFetchOk([rawItem({ priceCredits: undefined })])

    const { items } = await fetchCollectionItems('0xcollection')

    expect(items[0].priceCredits).toBe(0)
  })
})

describe('when deriving gender from body shapes', () => {
  it('should be unisex when both male and female shapes are present', async () => {
    mockFetchOk([rawItem({ data: { wearable: { bodyShapes: ['urn:BaseMale', 'urn:BaseFemale'] } } })])

    const { items } = await fetchCollectionItems('0xcollection')

    expect(items[0].gender).toBe('unisex')
  })

  it('should be female when only a female shape is present', async () => {
    mockFetchOk([rawItem({ data: { wearable: { bodyShapes: ['urn:BaseFemale'] } } })])

    const { items } = await fetchCollectionItems('0xcollection')

    expect(items[0].gender).toBe('female')
  })

  it('and there are no body shapes it should be null', async () => {
    mockFetchOk([rawItem({ data: { wearable: { bodyShapes: [] } } })])

    const { items } = await fetchCollectionItems('0xcollection')

    expect(items[0].gender).toBeNull()
  })

  it('and there is no wearable data it should be null', async () => {
    mockFetchOk([rawItem({ data: { emote: { category: 'dance' } } })])

    const { items } = await fetchCollectionItems('0xcollection')

    expect(items[0].gender).toBeNull()
  })
})

describe('when mapping optional catalog fields', () => {
  it('should use the emote category when there is no wearable category', async () => {
    mockFetchOk([rawItem({ data: { emote: { category: 'dance' } } })])

    const { items } = await fetchCollectionItems('0xcollection')

    expect(items[0].wearableCategory).toBe('dance')
  })

  it('should apply defaults for missing creator, itemId, rarity and thumbnail', async () => {
    mockFetchOk([rawItem({ creator: undefined, itemId: null, rarity: undefined, thumbnail: undefined })])

    const { items } = await fetchCollectionItems('0xcollection')

    expect(items[0].creator).toBe('')
    expect(items[0].itemId).toBeNull()
    expect(items[0].rarity).toBe('common')
    expect(items[0].thumbnail).toBe('')
  })
})

describe('when fetching the full catalog (browse "All" / "Not for Sale")', () => {
  it('should hit /v3/catalog/items with the shared filters and forward isWearableSmart + isOnSale', async () => {
    const fetchMock = mockFetchOk([rawItem({ priceCredits: 0 })])

    const { items } = await fetchCatalogItems({
      category: 'wearable',
      rarities: ['legendary'],
      wearableCategories: ['eyewear'],
      search: 'stars',
      sortBy: 'newest',
      isWearableSmart: true,
      isOnSale: false,
      first: 48
    })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('http://mps.test/v3/catalog/items')
    expect(url.searchParams.get('category')).toBe('wearable')
    expect(url.searchParams.getAll('rarity')).toEqual(['legendary'])
    expect(url.searchParams.getAll('wearableCategory')).toEqual(['eyewear'])
    expect(url.searchParams.get('search')).toBe('stars')
    expect(url.searchParams.get('isWearableSmart')).toBe('true')
    expect(url.searchParams.get('isOnSale')).toBe('false')
    expect(url.searchParams.get('includeSocialEmotes')).toBe('false')
    // priceCredits === 0 flags a not-for-sale item.
    expect(items[0].priceCredits).toBe(0)
  })

  // The endpoint returns the canonical urn on every row, and it is the ONLY identifier the 3D preview can
  // use for a non-Polygon item (see CatalogItem.urn / HoverPreviewLayer): from contractAddress + itemId the
  // preview assumes matic:collections-v2 and finds nothing for an Ethereum collections-v1 wearable — which
  // is most of the "Not for Sale" grid. Dropping the field in the mapper is what silently disabled it.
  it('should carry the item urn through to the card row', async () => {
    mockFetchOk([
      rawItem({ urn: 'urn:decentraland:ethereum:collections-v1:exclusive_masks:theater_mask', network: 'ETHEREUM' })
    ])

    const { items } = await fetchCatalogItems({ isOnSale: false })

    expect(items[0].urn).toBe('urn:decentraland:ethereum:collections-v1:exclusive_masks:theater_mask')
  })

  it('should omit the category param when it is "all"', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCatalogItems({ category: 'all' })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.has('category')).toBe(false)
  })

  it('should omit the category param for "names", which is a destination and not an item category', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCatalogItems({ category: 'names' })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.has('category')).toBe(false)
  })

  it('should send the credit price range in credits (never the MANA-denominated minPrice/maxPrice)', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCatalogItems({ minPriceCredits: 5, maxPriceCredits: 50 })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('minPriceCredits')).toBe('5')
    expect(url.searchParams.get('maxPriceCredits')).toBe('50')
    expect(url.searchParams.has('minPrice')).toBe(false)
    expect(url.searchParams.has('maxPrice')).toBe(false)
  })

  it('should omit the credit price range when no bound is set', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCatalogItems({})

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.has('minPriceCredits')).toBe(false)
    expect(url.searchParams.has('maxPriceCredits')).toBe(false)
  })

  it('should scope the feed to one creator when asked', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCatalogItems({ creator: '0xcreator' })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('creator')).toBe('0xcreator')
  })

  it('should omit isOnSale entirely for the "all" status (undefined)', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCatalogItems({})

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.has('isOnSale')).toBe(false)
  })
})

/**
 * A COLLECTION-STORE MINT, as /v3/catalog/items reports it: on sale, priced, and with NO trade — because it
 * is minted from the store contract and no trade will ever exist. Its `price` is MANA, and the row has to
 * carry that plus its acquisition, or every surface downstream has to guess: the creator page priced it off
 * the server's converted number (4 credits) while the browse grid converted the MANA live (14), and the item
 * page called it not for sale.
 */
describe('when the catalog reports a store mint', () => {
  it('should carry the MANA price and the stock, so the price can be converted live', async () => {
    mockFetchOk([
      rawItem({ priceCredits: 4, price: '20000000000000000000', tradeId: null, isOnSale: true, available: '48' })
    ])

    const { items } = await fetchCatalogItems({})

    expect(items[0].manaWei).toBe('20000000000000000000')
    expect(items[0].available).toBe(48)
    // NOT labelled as a store mint: this feed cannot tell a mint from a classic order, and guessing would
    // route the purchase down the wrong rail. Only the unified feed carries that discriminator.
    expect(items[0].acquisition).toBeUndefined()
    // The server's own conversion is still carried, but it is not what a surface should render — see
    // displayCredits in lib/mana-convert, which prefers manaWei at the live rate.
    expect(items[0].priceCredits).toBe(4)
  })

  it('should not invent a store acquisition for an item that is not on sale', async () => {
    mockFetchOk([rawItem({ priceCredits: 0, price: '20000000000000000000', tradeId: null, isOnSale: false })])

    const { items } = await fetchCatalogItems({})

    expect(items[0].manaWei).toBeUndefined()
  })

  // A row with a trade is priced by whichever rail owns it; this mapper must not convert its price.
  it('should leave a traded row alone', async () => {
    mockFetchOk([rawItem({ priceCredits: 11, price: '1100000000000000000', tradeId: 'tr-9', isOnSale: true })])

    const { items } = await fetchCatalogItems({})

    expect(items[0].manaWei).toBeUndefined()
    expect(items[0].priceCredits).toBe(11)
  })
})

describe('sanitizeCollectionName', () => {
  it('should convert a dcl:// URI to title-cased words', () => {
    expect(sanitizeCollectionName('dcl://cybermike_cybersoldier_set')).toBe('Cybermike Cybersoldier Set')
  })

  it('should handle single-word slugs', () => {
    expect(sanitizeCollectionName('dcl://atari')).toBe('Atari')
  })

  it('should handle multi-word slugs like dcl://rac_basics', () => {
    expect(sanitizeCollectionName('dcl://rac_basics')).toBe('Rac Basics')
  })

  it('should leave non-dcl:// names unchanged', () => {
    expect(sanitizeCollectionName('Cybermike Jump Jet Dunks')).toBe('Cybermike Jump Jet Dunks')
  })

  it('should leave empty string unchanged', () => {
    expect(sanitizeCollectionName('')).toBe('')
  })
})
