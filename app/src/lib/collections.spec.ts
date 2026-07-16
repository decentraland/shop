import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'http://mps.test', nftApiUrl: 'http://nft.test' } }))

import { fetchCollection, fetchCollectionItems, fetchCreatorItems, fetchCreatorCollections } from '~/lib/collections'

type RawItem = {
  id: string
  name: string
  creator?: string
  contractAddress: string
  itemId?: string | null
  category: string
  rarity?: string
  network: string
  chainId: number
  thumbnail?: string
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
    priceCredits: 10,
    data: { wearable: { category: 'hat', bodyShapes: ['urn:BaseMale'] } },
    ...overrides,
  }
}

function mockFetchOk(data: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function mockFetchNotOk(status: number) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
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
      sortBy: 'cheapest',
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
      category: 'wearable',
      wearableCategory: 'hat',
      rarity: 'epic',
      isSmart: false,
      network: 'MATIC',
      chainId: 137,
      thumbnail: 'http://img.test/hat.png',
      priceCredits: 10,
      gender: 'male',
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
    expect(url.origin + url.pathname).toBe('http://nft.test/v1/collections')
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
})

describe('when fetching a creator’s published collections', () => {
  it('should query /v1/collections by creator, newest first, with paging forwarded', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCreatorCollections('0xArtist', { first: 12, skip: 24 })

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('http://nft.test/v1/collections')
    expect(url.searchParams.get('creator')).toBe('0xArtist')
    expect(url.searchParams.get('sortBy')).toBe('newest')
    expect(url.searchParams.get('first')).toBe('12')
    expect(url.searchParams.get('skip')).toBe('24')
  })

  it('should map each collection to meta + item count (from `size`)', async () => {
    mockFetchOk([
      { contractAddress: '0xc1', name: 'Soul Magic', creator: '0xartist', size: 250 },
      { contractAddress: '0xc2', name: 'Neon Dreams', creator: '0xartist', size: 3 },
    ])

    const { collections } = await fetchCreatorCollections('0xartist')

    expect(collections).toEqual([
      { contractAddress: '0xc1', name: 'Soul Magic', creator: '0xartist', itemCount: 250 },
      { contractAddress: '0xc2', name: 'Neon Dreams', creator: '0xartist', itemCount: 3 },
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
      json: async () => ({ data: [{ contractAddress: '0xc1', size: 1 }], total: 42 }),
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
