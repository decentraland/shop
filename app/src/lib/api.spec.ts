import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TradeAssetType } from '@dcl/schemas'

// Deterministic URLs so we can assert exactly which endpoint each fetcher hits.
vi.mock('~/config', () => ({
  config: {
    marketplaceServerUrl: 'https://market.test',
    nftApiUrl: 'https://nft.test',
    chainId: 80002
  }
}))

// postTrade dynamically imports TradeService only when creating a listing. Stub it so importing the
// module (and calling postTrade) never drags in decentraland-dapps' ui2/@mui barrel.
const addTradeMock = vi.fn(async () => ({ id: 'trade-created' }))
const tradeServiceCtor = vi.fn()
vi.mock('decentraland-dapps/dist/modules/trades/TradeService', () => ({
  TradeService: class {
    constructor(signer: string, url: string, getIdentity: unknown) {
      tradeServiceCtor(signer, url, getIdentity)
    }
    addTrade = addTradeMock
  }
}))

// ethers stays REAL — toCredits() uses formatEther and usdWeiToCents() uses BigInt.

import {
  usdWeiToCents,
  fetchCatalog,
  fetchCollectionSaleState,
  fetchShopListingForItem,
  fetchListings,
  fetchUnified,
  fetchShopItems,
  fetchMyAssets,
  fetchTrade,
  fetchTradeDisplay,
  fetchTradeForItem,
  resolveLiveTrade,
  TradeNotFoundError,
  postTrade
} from '~/lib/api'

// $1 in USD wei.
const USD1 = '1000000000000000000'

// A jsonOk/error factory for the mocked global fetch. Records the URL of each call.
const fetchMock = vi.fn()

function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

function httpError(status: number) {
  return { ok: false, status, json: async () => ({}) }
}

function lastUrl(): string {
  return String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0])
}

beforeEach(() => {
  fetchMock.mockReset()
  addTradeMock.mockClear()
  tradeServiceCtor.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('when converting a USD-pegged wei amount to cents', () => {
  it('should return 0 for a missing amount', () => {
    expect(usdWeiToCents()).toBe(0)
    expect(usdWeiToCents(null)).toBe(0)
    expect(usdWeiToCents('')).toBe(0)
  })

  it('should convert exact dollar amounts to whole cents', () => {
    expect(usdWeiToCents(USD1)).toBe(100)
    expect(usdWeiToCents('5000000000000000000')).toBe(500)
  })

  it('should round fractional cents UP so the credit never under-covers', () => {
    // 1 cent + 1 wei → still rounds up to 2 cents.
    expect(usdWeiToCents('10000000000000001')).toBe(2)
    // just under a full cent → 1 cent.
    expect(usdWeiToCents('9999999999999999')).toBe(1)
  })

  it('should stay exact for very large wei amounts', () => {
    // 1000 dollars = 100000 cents, exactly.
    expect(usdWeiToCents('1000000000000000000000')).toBe(100000)
  })

  it('should return 0 when the amount is not a valid bigint', () => {
    expect(usdWeiToCents('not-a-number')).toBe(0)
  })
})

describe('when fetching the browse catalog', () => {
  it('should map raw items to CatalogItems and derive credits, gender and sub-category', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        total: 1,
        data: [
          {
            id: 'i1',
            name: 'Cool Hat',
            contractAddress: '0xabc',
            itemId: '7',
            category: 'wearable',
            rarity: 'epic',
            network: 'MATIC',
            chainId: 80002,
            thumbnail: 'thumb.png',
            price: USD1,
            data: { wearable: { category: 'hat', bodyShapes: ['urn:BaseMale', 'urn:BaseFemale'] } }
          }
        ]
      })
    )

    const { items, total } = await fetchCatalog()

    expect(total).toBe(1)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'i1',
      name: 'Cool Hat',
      itemId: '7',
      wearableCategory: 'hat',
      rarity: 'epic',
      priceCredits: 10, // $1 = 10 credits
      gender: 'unisex'
    })
  })

  it('should request the v2 catalog with on-sale, newest and social-emote filters', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ total: 0, data: [] }))
    await fetchCatalog({ category: 'emote', first: 5, skip: 10 })
    const url = lastUrl()
    expect(url).toContain('https://nft.test/v2/catalog?')
    expect(url).toContain('category=emote')
    expect(url).toContain('first=5')
    expect(url).toContain('skip=10')
    expect(url).toContain('isOnSale=true')
    expect(url).toContain('sortBy=newest')
    expect(url).toContain('includeSocialEmotes=false')
  })

  it('should default fields that are absent and fall back to minPrice', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        data: [
          {
            id: 'i2',
            name: 'Bare',
            contractAddress: '0xdef',
            category: 'wearable',
            network: 'MATIC',
            chainId: 80002,
            minPrice: USD1
          }
        ]
      })
    )
    const { items, total } = await fetchCatalog()
    expect(items[0]).toMatchObject({
      creator: '',
      itemId: null,
      rarity: 'common',
      thumbnail: '',
      priceCredits: 10,
      gender: null,
      wearableCategory: undefined
    })
    // total falls back to data.length when the response omits it.
    expect(total).toBe(1)
  })

  it('should round the credit price UP from the USD-pegged wei price', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        total: 1,
        data: [
          {
            id: 'i3',
            name: 'Cheap',
            contractAddress: '0x1',
            category: 'wearable',
            network: 'MATIC',
            chainId: 80002,
            // $0.11 → 1.1 credits → ceil → 2 credits.
            price: '110000000000000000'
          }
        ]
      })
    )
    const { items } = await fetchCatalog()
    expect(items[0].priceCredits).toBe(2)
  })

  it('should throw when the catalog request fails', async () => {
    fetchMock.mockResolvedValueOnce(httpError(503))
    await expect(fetchCatalog()).rejects.toThrow('Failed to fetch catalog (503)')
  })
})

describe('when resolving a collection sale state from the shop feed', () => {
  it('should key primary listings by itemId and skip secondary / itemId-less rows', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        total: 3,
        data: [
          { tradeId: 't1', listingType: 'primary', itemId: '1', priceCredits: 10 },
          { tradeId: 't2', listingType: 'secondary', itemId: '2', priceCredits: 20 },
          { tradeId: 't3', listingType: 'primary', itemId: null, priceCredits: 30 }
        ]
      })
    )
    const map = await fetchCollectionSaleState('0xcol')
    expect(Object.keys(map)).toEqual(['1'])
    expect(map['1']).toEqual({ isOnSale: true, priceCredits: 10, tradeId: 't1' })
    // filters by contractAddress against the v3 shop endpoint.
    expect(lastUrl()).toContain('https://market.test/v3/catalog/shop?')
    expect(lastUrl()).toContain('contractAddress=0xcol')
  })

  it('should propagate the shop-feed error', async () => {
    fetchMock.mockResolvedValueOnce(httpError(500))
    await expect(fetchCollectionSaleState('0xcol')).rejects.toThrow('fetchShopListings 500')
  })
})

describe('when fetching a single shop listing for an item', () => {
  it('should map the first listing to a CatalogItem carrying the tradeId', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        data: [
          {
            tradeId: 'trade-9',
            listingType: 'primary',
            contractAddress: '0xc',
            itemId: '9',
            tokenId: null,
            name: 'Item9',
            thumbnail: 't.png',
            rarity: 'rare',
            category: 'wearable',
            wearableCategory: 'hat',
            creator: '0xcreator',
            priceCredits: 15,
            available: 1,
            network: 'MATIC',
            chainId: 80002
          }
        ]
      })
    )
    const item = await fetchShopListingForItem('0xc', '9')
    expect(item).toMatchObject({
      id: 'trade-9',
      tradeId: 'trade-9',
      name: 'Item9',
      creator: '0xcreator',
      itemId: '9',
      tokenId: undefined,
      wearableCategory: 'hat',
      priceCredits: 15,
      gender: null
    })
    const url = lastUrl()
    expect(url).toContain('itemId=9')
    expect(url).toContain('first=1')
  })

  it('should return null when no listing exists for the item', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ data: [] }))
    expect(await fetchShopListingForItem('0xc', '9')).toBeNull()
  })
})

describe('when fetching the shop browse listings', () => {
  it('should map all listings and pass through the total', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        total: 2,
        data: [
          {
            tradeId: 'a',
            listingType: 'primary',
            contractAddress: '0x1',
            itemId: '1',
            tokenId: null,
            name: 'A',
            thumbnail: '',
            rarity: 'common',
            category: 'wearable',
            wearableCategory: null,
            creator: '0xa',
            priceCredits: 5,
            available: 1,
            network: 'MATIC',
            chainId: 80002
          },
          {
            tradeId: 'b',
            listingType: 'secondary',
            contractAddress: '0x2',
            itemId: null,
            tokenId: '42',
            name: 'B',
            thumbnail: '',
            rarity: 'rare',
            category: 'emote',
            wearableCategory: null,
            creator: '0xb',
            priceCredits: 8,
            available: 1,
            network: 'MATIC',
            chainId: 80002
          }
        ]
      })
    )
    const { items, total } = await fetchListings()
    expect(total).toBe(2)
    expect(items.map(i => i.id)).toEqual(['a', 'b'])
    // secondary listing carries its tokenId.
    expect(items[1].tokenId).toBe('42')
  })

  it('should serialise every supported filter into the query string', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ total: 0, data: [] }))
    await fetchListings({
      category: 'wearable',
      first: 12,
      skip: 24,
      contractAddress: '0xc',
      itemId: '3',
      creator: '0xcreator',
      rarities: ['epic', 'legendary'],
      wearableCategories: ['hat', 'hair'],
      minPriceCredits: 1,
      maxPriceCredits: 100,
      search: 'dragon',
      sortBy: 'cheapest'
    })
    const url = lastUrl()
    expect(url).toContain('category=wearable')
    expect(url).toContain('first=12')
    expect(url).toContain('skip=24')
    expect(url).toContain('contractAddress=0xc')
    expect(url).toContain('itemId=3')
    expect(url).toContain('creator=0xcreator')
    expect(url).toContain('rarity=epic%2Clegendary')
    expect(url).toContain('wearableCategory=hat%2Chair')
    expect(url).toContain('minPriceCredits=1')
    expect(url).toContain('maxPriceCredits=100')
    expect(url).toContain('search=dragon')
    expect(url).toContain('sortBy=cheapest')
  })

  it('should ignore an unsupported category and default first to 100', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ total: 0, data: [] }))
    await fetchListings({ category: 'bogus' })
    const url = lastUrl()
    expect(url).not.toContain('category=')
    expect(url).toContain('first=100')
  })

  it('should default to empty items and zero total when the response omits them', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({}))
    const { items, total } = await fetchListings()
    expect(items).toEqual([])
    expect(total).toBe(0)
  })

  it('should throw when the shop listings request fails', async () => {
    fetchMock.mockResolvedValueOnce(httpError(404))
    await expect(fetchListings()).rejects.toThrow('fetchShopListings 404')
  })

  it('should map flash-sale fields: compare-at passthrough + expiration seconds → ms', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        total: 1,
        data: [
          {
            tradeId: 's',
            listingType: 'primary',
            contractAddress: '0x1',
            itemId: '1',
            tokenId: null,
            name: 'S',
            thumbnail: '',
            rarity: 'common',
            category: 'wearable',
            wearableCategory: null,
            creator: '0xa',
            priceCredits: 7,
            available: 1,
            network: 'MATIC',
            chainId: 80002,
            compareAtCredits: 10,
            saleEndsAt: 1_700_000_000
          }
        ]
      })
    )
    const { items } = await fetchListings()
    expect(items[0].compareAtCredits).toBe(10)
    expect(items[0].saleEndsAt).toBe(1_700_000_000 * 1000)
  })

  it('should drop a compare-at that does not beat the sale price (no phantom discount)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        total: 1,
        data: [
          {
            tradeId: 's',
            listingType: 'primary',
            contractAddress: '0x1',
            itemId: '1',
            tokenId: null,
            name: 'S',
            thumbnail: '',
            rarity: 'common',
            category: 'wearable',
            wearableCategory: null,
            creator: '0xa',
            priceCredits: 10,
            available: 1,
            network: 'MATIC',
            chainId: 80002,
            compareAtCredits: 10,
            saleEndsAt: null
          }
        ]
      })
    )
    const { items } = await fetchListings()
    expect(items[0].compareAtCredits).toBeUndefined()
    expect(items[0].saleEndsAt).toBeUndefined()
  })
})

describe('when fetching the unified browse listings', () => {
  // A native row (USD-pegged, credit-buyable) + a legacy row (MANA-priced) in one response.
  const nativeRow = {
    tradeId: 'u-native',
    listingType: 'primary',
    contractAddress: '0x1',
    itemId: '1',
    tokenId: null,
    name: 'Native Hat',
    thumbnail: '',
    rarity: 'epic',
    category: 'wearable',
    wearableCategory: 'hat',
    creator: '0xa',
    priceCredits: 270,
    available: 100,
    network: 'MATIC',
    chainId: 80002,
    source: 'native',
    manaWei: null
  }
  const legacyRow = {
    tradeId: 'u-legacy',
    listingType: 'primary',
    contractAddress: '0x2',
    itemId: '2',
    tokenId: null,
    name: 'Legacy Cap',
    thumbnail: '',
    rarity: 'legendary',
    category: 'wearable',
    wearableCategory: 'hat',
    creator: '0xb',
    priceCredits: 100,
    available: 1,
    network: 'MATIC',
    chainId: 80002,
    source: 'legacy',
    manaWei: '100000000000000000000'
  }

  it('should hit the v3 unified endpoint and map native + legacy rows carrying source and manaWei', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ total: 2, data: [nativeRow, legacyRow] }))
    const { items, total } = await fetchUnified()
    expect(total).toBe(2)
    expect(lastUrl()).toContain('https://market.test/v3/catalog/unified?')

    // Native row → source 'native', no manaWei, fixed credit price, carries the tradeId.
    expect(items[0]).toMatchObject({
      id: 'u-native',
      tradeId: 'u-native',
      name: 'Native Hat',
      source: 'native',
      manaWei: null,
      priceCredits: 270
    })

    // Legacy row → source 'legacy' + the raw manaWei (the UI converts it live).
    expect(items[1]).toMatchObject({
      id: 'u-legacy',
      tradeId: 'u-legacy',
      name: 'Legacy Cap',
      source: 'legacy',
      manaWei: '100000000000000000000'
    })
  })

  it('should serialise every supported filter into the query string', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ total: 0, data: [] }))
    await fetchUnified({
      category: 'wearable',
      first: 12,
      skip: 24,
      rarities: ['epic', 'legendary'],
      wearableCategories: ['hat', 'hair'],
      minPriceCredits: 1,
      maxPriceCredits: 100,
      search: 'dragon',
      sortBy: 'cheapest'
    })
    const url = lastUrl()
    expect(url).toContain('category=wearable')
    expect(url).toContain('first=12')
    expect(url).toContain('skip=24')
    expect(url).toContain('rarity=epic%2Clegendary')
    expect(url).toContain('wearableCategory=hat%2Chair')
    expect(url).toContain('minPriceCredits=1')
    expect(url).toContain('maxPriceCredits=100')
    expect(url).toContain('search=dragon')
    expect(url).toContain('sortBy=cheapest')
  })

  it('should default first to 100 and normalise a missing manaWei to null', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ data: [{ ...legacyRow, manaWei: undefined, source: 'native' }] }))
    const { items, total } = await fetchUnified()
    expect(lastUrl()).toContain('first=100')
    expect(items[0].manaWei).toBeNull()
    // total falls back to data.length when omitted.
    expect(total).toBe(1)
  })

  it('should throw when the unified request fails', async () => {
    fetchMock.mockResolvedValueOnce(httpError(502))
    await expect(fetchUnified()).rejects.toThrow('fetchUnified 502')
  })
})

describe('when fetching the item-unified browse feed', () => {
  // A representative item row: same shape as a unified listing row plus the per-item listingCount.
  const itemRow = {
    tradeId: 'i-native',
    listingType: 'primary',
    contractAddress: '0x1',
    itemId: '1',
    tokenId: null,
    name: 'Native Hat',
    thumbnail: '',
    rarity: 'epic',
    category: 'wearable',
    wearableCategory: 'hat',
    creator: '0xa',
    priceCredits: 270,
    available: 100,
    network: 'MATIC',
    chainId: 80002,
    source: 'native',
    manaWei: null,
    listingCount: 3
  }

  it('should hit /v3/catalog/unified with groupBy=item and carry listingCount onto the card model', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ total: 1, data: [itemRow] }))
    const { items, total } = await fetchShopItems()
    expect(total).toBe(1)
    const url = lastUrl()
    expect(url).toContain('https://market.test/v3/catalog/unified?')
    expect(url).toContain('groupBy=item')
    expect(items[0]).toMatchObject({
      id: 'i-native',
      tradeId: 'i-native',
      name: 'Native Hat',
      source: 'native',
      manaWei: null,
      priceCredits: 270,
      listingCount: 3
    })
  })

  it('should serialise every supported filter alongside groupBy=item', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ total: 0, data: [] }))
    await fetchShopItems({
      category: 'wearable',
      first: 12,
      skip: 24,
      rarities: ['epic', 'legendary'],
      wearableCategories: ['hat', 'hair'],
      minPriceCredits: 1,
      maxPriceCredits: 100,
      search: 'dragon',
      sortBy: 'cheapest',
      isSmart: true
    })
    const url = lastUrl()
    expect(url).toContain('groupBy=item')
    expect(url).toContain('category=wearable')
    expect(url).toContain('first=12')
    expect(url).toContain('skip=24')
    expect(url).toContain('rarity=epic%2Clegendary')
    expect(url).toContain('wearableCategory=hat%2Chair')
    expect(url).toContain('minPriceCredits=1')
    expect(url).toContain('maxPriceCredits=100')
    expect(url).toContain('search=dragon')
    expect(url).toContain('sortBy=cheapest')
    expect(url).toContain('isSmart=true')
  })

  it('should leave listingCount undefined when the row omits it, and default first to 100', async () => {
    const { listingCount, ...noCount } = itemRow
    void listingCount
    fetchMock.mockResolvedValueOnce(jsonOk({ data: [noCount] }))
    const { items, total } = await fetchShopItems()
    expect(lastUrl()).toContain('first=100')
    expect(items[0].listingCount).toBeUndefined()
    // total falls back to data.length when omitted.
    expect(total).toBe(1)
  })

  it('should throw when the item-unified request fails', async () => {
    fetchMock.mockResolvedValueOnce(httpError(502))
    await expect(fetchShopItems()).rejects.toThrow('fetchShopItems 502')
  })
})

describe('when fetching the owned assets of a wallet', () => {
  it('should lowercase the owner and hit the v1 nfts endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ total: 0, data: [] }))
    await fetchMyAssets('0xABCDEF', { category: 'emote', first: 10, skip: 2 })
    const url = lastUrl()
    expect(url).toContain('https://nft.test/v1/nfts?')
    expect(url).toContain('owner=0xabcdef')
    expect(url).toContain('category=emote')
    expect(url).toContain('first=10')
    expect(url).toContain('skip=2')
  })

  it('should mark listed assets on-sale with credit price and tradeId, and mark unlisted ones off-sale', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        total: 2,
        data: [
          {
            nft: {
              id: 'n1',
              contractAddress: '0xc',
              tokenId: '1',
              itemId: '5',
              name: 'Listed',
              category: 'wearable',
              image: 'img1',
              network: 'MATIC',
              chainId: 80002,
              data: { wearable: { rarity: 'legendary' } }
            },
            order: { price: USD1, tradeId: 'trade-x' }
          },
          {
            nft: {
              id: 'n2',
              contractAddress: '0xc',
              tokenId: '2',
              itemId: null,
              name: 'Unlisted',
              category: 'emote',
              image: 'img2',
              network: 'MATIC',
              chainId: 80002,
              data: { emote: { rarity: 'rare' } }
            },
            order: null
          }
        ]
      })
    )
    const { assets, total } = await fetchMyAssets('0xowner')
    expect(total).toBe(2)
    expect(assets[0]).toMatchObject({
      id: 'n1',
      itemId: '5',
      rarity: 'legendary',
      isOnSale: true,
      listingPrice: 10,
      tradeId: 'trade-x'
    })
    expect(assets[1]).toMatchObject({
      id: 'n2',
      itemId: null,
      rarity: 'rare',
      isOnSale: false,
      listingPrice: undefined,
      tradeId: undefined
    })
  })

  it('should throw when the assets request fails', async () => {
    fetchMock.mockResolvedValueOnce(httpError(500))
    await expect(fetchMyAssets('0xowner')).rejects.toThrow('Failed to fetch assets (500)')
  })
})

describe('when posting a signed trade', () => {
  it('should construct the TradeService with the app signer and marketplace url and forward addTrade', async () => {
    const trade = { id: 'the-trade' } as never
    const identity = { authChain: [] } as never
    const result = await postTrade(trade, identity)
    expect(result).toEqual({ id: 'trade-created' })
    expect(addTradeMock).toHaveBeenCalledWith(trade)
    expect(tradeServiceCtor).toHaveBeenCalledTimes(1)
    const [signer, url] = tradeServiceCtor.mock.calls[0]
    expect(signer).toBe('dcl:marketplace')
    expect(url).toBe('https://market.test')
  })
})

describe('when fetching a single signed trade', () => {
  it('should unwrap the { ok, data } envelope', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ ok: true, data: { id: 'wrapped' } }))
    const trade = await fetchTrade('t1')
    expect(trade).toEqual({ id: 'wrapped' })
    expect(lastUrl()).toBe('https://market.test/v1/trades/t1')
  })

  it('should return the body as-is when there is no data envelope', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ id: 'raw' }))
    const trade = await fetchTrade('t2')
    expect(trade).toEqual({ id: 'raw' })
  })

  it('should throw a TradeNotFoundError when the trade is gone (404)', async () => {
    fetchMock.mockResolvedValueOnce(httpError(404))
    const err = await fetchTrade('t3').catch(e => e)
    expect(err).toBeInstanceOf(TradeNotFoundError)
    expect(String(err.message)).toContain('fetchTrade 404')
  })

  it('should throw a plain error for a non-404 failure', async () => {
    fetchMock.mockResolvedValueOnce(httpError(500))
    const err = await fetchTrade('t4').catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(TradeNotFoundError)
    expect(String(err.message)).toContain('fetchTrade 500')
  })
})

describe('when resolving a purchased trade for display', () => {
  it('should return null when the trade cannot be fetched', async () => {
    fetchMock.mockResolvedValueOnce(httpError(500))
    expect(await fetchTradeDisplay('gone')).toBeNull()
  })

  it('should resolve a primary (collection item) purchase by its itemId via the items endpoint', async () => {
    // The off-chain Trade API carries the sold item's id in `itemId` (NOT a generic `value`); the
    // resolver must read that field and pass it to the /items lookup.
    fetchMock
      .mockResolvedValueOnce(
        jsonOk({
          data: {
            sent: [{ assetType: TradeAssetType.COLLECTION_ITEM, contractAddress: '0xc', itemId: '7' }],
            received: [{ amount: USD1 }]
          }
        })
      )
      .mockResolvedValueOnce(jsonOk({ data: [{ name: 'Minted Item', thumbnail: 'thumb.png' }] }))

    const display = await fetchTradeDisplay('pt')
    expect(display).toEqual({
      name: 'Minted Item',
      thumbnail: 'thumb.png',
      credits: 10,
      contractAddress: '0xc',
      itemId: '7'
    })
    // second call hits the /items metadata endpoint WITH the real itemId (regression guard: an empty
    // itemId filter used to silently return the collection's first item).
    expect(lastUrl()).toContain('https://nft.test/v1/items?')
    expect(lastUrl()).toContain('contractAddress=0xc')
    expect(lastUrl()).toContain('itemId=7')
  })

  it('should resolve a secondary (ERC721 token) purchase by its tokenId via the nfts endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonOk({
          data: {
            sent: [{ assetType: TradeAssetType.ERC721, contractAddress: '0xc', tokenId: '42' }],
            received: [{ amount: USD1 }]
          }
        })
      )
      .mockResolvedValueOnce(jsonOk({ data: [{ nft: { name: 'Token', image: 'img.png' } }] }))

    const display = await fetchTradeDisplay('pt')
    expect(display).toEqual({
      name: 'Token',
      thumbnail: 'img.png',
      credits: 10,
      contractAddress: '0xc',
      tokenId: '42'
    })
    expect(lastUrl()).toContain('https://nft.test/v1/nfts?')
    expect(lastUrl()).toContain('tokenId=42')
  })

  it('should still read a generic on-chain `value` field as a fallback', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonOk({
          data: {
            sent: [{ assetType: TradeAssetType.COLLECTION_ITEM, contractAddress: '0xc', value: '5' }],
            received: [{ amount: USD1 }]
          }
        })
      )
      .mockResolvedValueOnce(jsonOk({ data: [{ name: 'Legacy Item', thumbnail: 't.png' }] }))

    const display = await fetchTradeDisplay('pt')
    expect(display?.itemId).toBe('5')
    expect(lastUrl()).toContain('itemId=5')
  })

  it('should fall back to placeholder name/image when metadata lookup fails', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonOk({
          data: {
            sent: [{ assetType: TradeAssetType.ERC721, contractAddress: '0xc', tokenId: '99' }],
            received: [{ amount: USD1 }]
          }
        })
      )
      .mockResolvedValueOnce(httpError(404)) // nft meta lookup fails → returns null

    const display = await fetchTradeDisplay('pt')
    expect(display).toEqual({
      name: '#99',
      thumbnail: '',
      credits: 10,
      contractAddress: '0xc',
      tokenId: '99'
    })
  })

  it('should NOT query metadata with an empty id, returning a clean fallback instead', async () => {
    // A collection-item trade with no itemId/tokenId/value at all: querying /items with an empty
    // filter returns an unrelated item, so the resolver must skip the lookup and fall back cleanly.
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        data: {
          sent: [{ assetType: TradeAssetType.COLLECTION_ITEM, contractAddress: '0xc' }],
          received: [{ amount: USD1 }]
        }
      })
    )
    const display = await fetchTradeDisplay('pt')
    expect(display).toEqual({ name: 'Item', thumbnail: '', credits: 10, contractAddress: '0xc', itemId: '' })
    // only the trade was fetched — no metadata call with a blank id.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('should return a generic item with no metadata lookup when the contract address is missing', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        data: {
          sent: [{ assetType: TradeAssetType.ERC721, tokenId: '1' }],
          received: [{ amount: USD1 }]
        }
      })
    )
    const display = await fetchTradeDisplay('pt')
    expect(display).toEqual({ name: 'Item', thumbnail: '', credits: 10, contractAddress: '' })
    // only the trade was fetched — no metadata call.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('when resolving the open trade for a catalog item', () => {
  it('should resolve the tradeId from the shop feed and then fetch that trade', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonOk({ data: [{ tradeId: 'tr-1', itemId: '3' }] }))
      .mockResolvedValueOnce(jsonOk({ data: { id: 'tr-1' } }))

    const trade = await fetchTradeForItem('0xc', '3')
    expect(trade).toEqual({ id: 'tr-1' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('https://market.test/v3/catalog/shop?')
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://market.test/v1/trades/tr-1')
  })

  it('should return null when no listing exists for the item', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ data: [] }))
    expect(await fetchTradeForItem('0xc', '3')).toBeNull()
    // no trade fetch when there is no tradeId.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('when resolving an item to its live trade', () => {
  it('should use the known tradeId directly when it still exists', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ data: { id: 'tr-known' } }))
    const trade = await resolveLiveTrade({ tradeId: 'tr-known', contractAddress: '0xc', itemId: '4' })
    expect(trade).toEqual({ id: 'tr-known' })
    // one call only — no re-resolution when the trade is live.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://market.test/v1/trades/tr-known')
  })

  it('should re-resolve the current trade from the shop feed when the known tradeId is gone (404)', async () => {
    fetchMock
      .mockResolvedValueOnce(httpError(404)) // stale tradeId 404s
      .mockResolvedValueOnce(jsonOk({ data: [{ tradeId: 'tr-fresh', itemId: '4' }] })) // shop feed
      .mockResolvedValueOnce(jsonOk({ data: { id: 'tr-fresh' } })) // fresh trade
    const trade = await resolveLiveTrade({ tradeId: 'tr-stale', contractAddress: '0xc', itemId: '4' })
    expect(trade).toEqual({ id: 'tr-fresh' })
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://market.test/v1/trades/tr-stale')
    expect(String(fetchMock.mock.calls[1][0])).toContain('https://market.test/v3/catalog/shop?')
    expect(String(fetchMock.mock.calls[2][0])).toBe('https://market.test/v1/trades/tr-fresh')
  })

  it('should return null when the tradeId is gone and the item is no longer listed', async () => {
    fetchMock
      .mockResolvedValueOnce(httpError(404)) // stale tradeId 404s
      .mockResolvedValueOnce(jsonOk({ data: [] })) // no live listing
    expect(await resolveLiveTrade({ tradeId: 'tr-stale', contractAddress: '0xc', itemId: '4' })).toBeNull()
  })

  it('should NOT re-resolve on a non-404 failure (never silently swap the trade)', async () => {
    fetchMock.mockResolvedValueOnce(httpError(500))
    await expect(resolveLiveTrade({ tradeId: 'tr-x', contractAddress: '0xc', itemId: '4' })).rejects.toThrow(
      'fetchTrade 500'
    )
    // only the direct fetch happened — no fallback to the feed.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('should propagate the not-found when there is no itemId to re-resolve by', async () => {
    fetchMock.mockResolvedValueOnce(httpError(404))
    await expect(resolveLiveTrade({ tradeId: 'tr-x', contractAddress: '0xc', itemId: null })).rejects.toBeInstanceOf(
      TradeNotFoundError
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('should resolve straight from the shop feed when there is no known tradeId', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonOk({ data: [{ tradeId: 'tr-feed', itemId: '4' }] }))
      .mockResolvedValueOnce(jsonOk({ data: { id: 'tr-feed' } }))
    const trade = await resolveLiveTrade({ contractAddress: '0xc', itemId: '4' })
    expect(trade).toEqual({ id: 'tr-feed' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('https://market.test/v3/catalog/shop?')
  })

  it('should return null when there is neither a tradeId nor an itemId', async () => {
    expect(await resolveLiveTrade({ contractAddress: '0xc' })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
