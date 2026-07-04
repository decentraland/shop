import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { nftApiUrl: 'http://nft.test' } }))

// eslint-disable-next-line import/first
import { fetchCollectionItems, fetchCreatorItems } from '~/lib/collections'

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
  price?: string | null
  minPrice?: string | null
  data?: {
    wearable?: { category?: string; bodyShapes?: string[] }
    emote?: { category?: string }
  }
}

// 1e18 USD wei = $1 = 10 credits (Model B: ceil to whole credits).
const ONE_USD = '1000000000000000000'

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
    price: ONE_USD,
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
  it('should call the /v1/items endpoint with the collection contract, default first and social-emotes excluded', async () => {
    const fetchMock = mockFetchOk([rawItem()])

    await fetchCollectionItems('0xcollection')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('http://nft.test/v1/items')
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

  it('should map each raw item into a catalog item', async () => {
    mockFetchOk([rawItem()])

    const items = await fetchCollectionItems('0xcollection')

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

    const items = await fetchCollectionItems('0xcollection')

    expect(items).toEqual([])
  })

  it('and the response is not ok it should throw with the status', async () => {
    mockFetchNotOk(503)

    await expect(fetchCollectionItems('0xcollection')).rejects.toThrow('fetchCollectionItems 503')
  })
})

describe('when fetching a creator storefront', () => {
  it('should call the /v1/items endpoint with the creator, default first and social-emotes excluded', async () => {
    const fetchMock = mockFetchOk([])

    await fetchCreatorItems('0xartist')

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('http://nft.test/v1/items')
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

    const items = await fetchCreatorItems('0xartist')

    expect(items.map(i => i.id)).toEqual(['a', 'b'])
  })

  it('and the response is not ok it should throw with the status', async () => {
    mockFetchNotOk(404)

    await expect(fetchCreatorItems('0xartist')).rejects.toThrow('fetchCreatorItems 404')
  })
})

describe('when mapping the price to whole credits', () => {
  it('should round up to keep credits whole (Model B)', async () => {
    // 1.23 USD → 12.3 credits → ceil → 13.
    mockFetchOk([rawItem({ price: '1230000000000000000' })])

    const items = await fetchCollectionItems('0xcollection')

    expect(items[0].priceCredits).toBe(13)
  })

  it('and there is no price it should fall back to minPrice', async () => {
    mockFetchOk([rawItem({ price: null, minPrice: ONE_USD })])

    const items = await fetchCollectionItems('0xcollection')

    expect(items[0].priceCredits).toBe(10)
  })

  it('and neither price nor minPrice is present it should be zero credits', async () => {
    mockFetchOk([rawItem({ price: null, minPrice: null })])

    const items = await fetchCollectionItems('0xcollection')

    expect(items[0].priceCredits).toBe(0)
  })

  it('and the price is not a valid number it should be zero credits', async () => {
    mockFetchOk([rawItem({ price: 'not-a-number' })])

    const items = await fetchCollectionItems('0xcollection')

    expect(items[0].priceCredits).toBe(0)
  })
})

describe('when deriving gender from body shapes', () => {
  it('should be unisex when both male and female shapes are present', async () => {
    mockFetchOk([rawItem({ data: { wearable: { bodyShapes: ['urn:BaseMale', 'urn:BaseFemale'] } } })])

    const items = await fetchCollectionItems('0xcollection')

    expect(items[0].gender).toBe('unisex')
  })

  it('should be female when only a female shape is present', async () => {
    mockFetchOk([rawItem({ data: { wearable: { bodyShapes: ['urn:BaseFemale'] } } })])

    const items = await fetchCollectionItems('0xcollection')

    expect(items[0].gender).toBe('female')
  })

  it('and there are no body shapes it should be null', async () => {
    mockFetchOk([rawItem({ data: { wearable: { bodyShapes: [] } } })])

    const items = await fetchCollectionItems('0xcollection')

    expect(items[0].gender).toBeNull()
  })

  it('and there is no wearable data it should be null', async () => {
    mockFetchOk([rawItem({ data: { emote: { category: 'dance' } } })])

    const items = await fetchCollectionItems('0xcollection')

    expect(items[0].gender).toBeNull()
  })
})

describe('when mapping optional catalog fields', () => {
  it('should use the emote category when there is no wearable category', async () => {
    mockFetchOk([rawItem({ data: { emote: { category: 'dance' } } })])

    const items = await fetchCollectionItems('0xcollection')

    expect(items[0].wearableCategory).toBe('dance')
  })

  it('should apply defaults for missing creator, itemId, rarity and thumbnail', async () => {
    mockFetchOk([
      rawItem({ creator: undefined, itemId: null, rarity: undefined, thumbnail: undefined })
    ])

    const items = await fetchCollectionItems('0xcollection')

    expect(items[0].creator).toBe('')
    expect(items[0].itemId).toBeNull()
    expect(items[0].rarity).toBe('common')
    expect(items[0].thumbnail).toBe('')
  })
})
