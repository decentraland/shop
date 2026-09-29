import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'

// signed-fetch (ADR-44) is the READ path for the creator's collections/items. Capture the URLs it's
// called with and return whatever the current test queued.
const signedFetchMock = vi.fn()
vi.mock('decentraland-crypto-fetch', () => ({ default: (...args: unknown[]) => signedFetchMock(...args) }))

// Stable builder base so URL assertions are deterministic.
vi.mock('~/config', () => ({ config: { builderServerUrl: 'https://builder.test' } }))

// The fallback path reports the fast path's failure; the report itself is not under test here.
const captureError = vi.fn()
vi.mock('~/lib/monitoring', () => ({ captureError: (...args: unknown[]) => captureError(...args) }))

import {
  fetchCreatorCollections,
  fetchCollectionItems,
  fetchPublishableItems,
  fetchItemVideoUrl,
  isPublishable,
  type CreatorCollection,
  type PublishableItem
} from '~/lib/builder'

const identity = {} as AuthIdentity

// Build a signed-fetch Response-ish object. `body` is what res.json() resolves to.
function okRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
}
function errRes(status: number, text = 'boom') {
  return { ok: false, status, json: async () => ({}), text: async () => text }
}

// A fully-publishable clean collection for reuse.
function cleanCollection(overrides: Partial<CreatorCollection> = {}): CreatorCollection {
  return {
    id: 'col-1',
    name: 'My Collection',
    contractAddress: '0xcontract',
    isPublished: true,
    isApproved: true,
    minters: ['0xminter'],
    ...overrides
  }
}

beforeEach(() => {
  signedFetchMock.mockReset()
  captureError.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})

describe("when fetching a creator's published collections", () => {
  it('should call the address-scoped published route and unwrap a { data } envelope', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        ok: true,
        data: [
          {
            id: 'col-1',
            name: 'Hats',
            eth_address: '0xCreator',
            contract_address: '0xABCDEF',
            is_published: true,
            is_approved: true,
            minters: ['0xMintER']
          }
        ]
      })
    )

    const collections = await fetchCreatorCollections('0xCREATOR', identity)

    expect(signedFetchMock).toHaveBeenCalledTimes(1)
    const [url] = signedFetchMock.mock.calls[0]
    expect(url).toBe('https://builder.test/v1/0xcreator/collections?is_published=true')
    expect(collections).toEqual([
      {
        id: 'col-1',
        name: 'Hats',
        contractAddress: '0xabcdef',
        isPublished: true,
        isApproved: true,
        minters: ['0xminter']
      }
    ])
  })

  it('and a collection has no on-chain contract address it should be dropped', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          { id: 'a', name: 'Published', contract_address: '0xaaa', is_published: true, is_approved: true },
          { id: 'b', name: 'Unpublished', contract_address: null, is_published: true, is_approved: false },
          { id: 'c', name: 'Not published', contract_address: '0xccc', is_published: false, is_approved: true }
        ]
      })
    )

    const collections = await fetchCreatorCollections('0xcreator', identity)

    expect(collections.map(c => c.id)).toEqual(['a'])
    expect(collections[0].minters).toEqual([])
  })

  it('and the payload is a bare array (no envelope) it should still unwrap', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes([{ id: 'x', name: 'Bare', contract_address: '0xXyZ', is_published: true, is_approved: true }])
    )

    const collections = await fetchCreatorCollections('0xcreator', identity)

    expect(collections).toHaveLength(1)
    expect(collections[0].contractAddress).toBe('0xxyz')
  })

  it('and the server returns a { results } envelope it should unwrap that shape', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({ results: [{ id: 'r', name: 'Res', contract_address: '0xrrr', is_published: true, is_approved: true }] })
    )

    const collections = await fetchCreatorCollections('0xcreator', identity)

    expect(collections.map(c => c.id)).toEqual(['r'])
  })

  it('and the response is not ok it should throw with the status', async () => {
    signedFetchMock.mockResolvedValueOnce(errRes(403, 'forbidden'))

    await expect(fetchCreatorCollections('0xcreator', identity)).rejects.toThrow(/builder-server 403/)
  })
})

describe('when fetching the items inside a collection', () => {
  it('should map a fully-publishable item and resolve its inline thumbnail', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          {
            id: 'item-1',
            collection_id: 'col-1',
            blockchain_item_id: '3',
            name: 'Cool Hat',
            rarity: 'rare',
            total_supply: '10',
            type: 'wearable',
            is_published: true,
            is_approved: true,
            thumbnail: 'thumbnail.png',
            contents: { 'thumbnail.png': 'QmHASH' },
            data: { wearable: { category: 'hat' } }
          }
        ]
      })
    )

    const items = await fetchCollectionItems(cleanCollection(), identity)

    expect(signedFetchMock.mock.calls[0][0]).toBe('https://builder.test/v1/collections/col-1/items')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'item-1',
      collectionId: 'col-1',
      collectionName: 'My Collection',
      contractAddress: '0xcontract',
      blockchainItemId: '3',
      name: 'Cool Hat',
      category: 'hat',
      rarity: 'rare',
      type: 'wearable',
      isPublished: true,
      isApproved: true,
      totalSupply: 10,
      maxSupply: 5000,
      remainingSupply: 4990,
      minters: ['0xminter']
    })
    // Inline thumbnail resolved via contents map → storage content URL. No public fetch needed.
    expect(items[0].thumbnail).toBe('https://builder.test/v1/storage/contents/QmHASH')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('and an item lacks an on-chain blockchain_item_id it should be filtered out', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          {
            id: 'no-onchain',
            collection_id: 'col-1',
            blockchain_item_id: null,
            name: 'Draft',
            rarity: 'common',
            total_supply: '0',
            is_published: true,
            is_approved: true
          }
        ]
      })
    )
    // No blockchainItemId → resolveThumbnail short-circuits, no public fetch.
    const items = await fetchCollectionItems(cleanCollection(), identity)

    expect(items).toEqual([])
  })

  it('and an item is sold out it should be filtered out', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          {
            id: 'soldout',
            collection_id: 'col-1',
            blockchain_item_id: '0',
            name: 'Sold Out',
            rarity: 'mythic',
            total_supply: 10, // mythic max supply is 10 → 0 remaining
            is_published: true,
            is_approved: true,
            thumbnail: 'thumbnail.png',
            contents: { 'thumbnail.png': 'QmX' }
          }
        ]
      })
    )

    const items = await fetchCollectionItems(cleanCollection(), identity)

    expect(items).toEqual([])
  })

  it('and rarity is unknown maxSupply defaults to 0 which filters the item out (no supply)', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          {
            id: 'weird',
            collection_id: 'col-1',
            blockchain_item_id: '1',
            name: 'Weird',
            rarity: 'nonsense-rarity',
            total_supply: '0',
            is_published: true,
            is_approved: true,
            thumbnail: 'thumbnail.png',
            contents: { 'thumbnail.png': 'QmY' }
          }
        ]
      })
    )

    const items = await fetchCollectionItems(cleanCollection(), identity)

    // 0 max supply → 0 remaining → not publishable.
    expect(items).toEqual([])
  })

  it('should fall back to the public per-item contents endpoint when contents are absent', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          {
            id: 'needs-fallback',
            collection_id: 'col-1',
            contract_address: '0xITEMCONTRACT',
            blockchain_item_id: '7',
            name: 'Fallback Hat',
            rarity: 'epic',
            total_supply: '0',
            is_published: true,
            is_approved: true,
            thumbnail: 'thumbnail.png'
            // no contents → resolveThumbnail hits the public endpoint
          }
        ]
      })
    )
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okRes({ data: { 'thumbnail.png': 'QmFALLBACK' } }))

    const items = await fetchCollectionItems(cleanCollection(), identity)

    expect(fetch).toHaveBeenCalledTimes(1)
    const contractAddr = '0xitemcontract'
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      `https://builder.test/v1/items/${contractAddr}/7/contents`
    )
    expect(items[0].thumbnail).toBe('https://builder.test/v1/storage/contents/QmFALLBACK')
    // contract_address on the item overrides the parent collection's address, lowercased.
    expect(items[0].contractAddress).toBe(contractAddr)
  })

  it('should tolerate a failing public contents endpoint and emit an empty thumbnail', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          {
            id: 'thumbless',
            collection_id: 'col-1',
            blockchain_item_id: '2',
            name: 'No Thumb',
            rarity: 'legendary',
            total_supply: '0',
            is_published: true,
            is_approved: true,
            thumbnail: 'thumbnail.png'
          }
        ]
      })
    )
    ;(fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'))

    const items = await fetchCollectionItems(cleanCollection(), identity)

    expect(items).toHaveLength(1)
    expect(items[0].thumbnail).toBe('')
  })

  it('should keep an already-absolute thumbnail URL untouched without any fetch', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          {
            id: 'abs',
            collection_id: 'col-1',
            blockchain_item_id: '5',
            name: 'Absolute',
            rarity: 'common',
            total_supply: '0',
            is_published: true,
            is_approved: true,
            thumbnail: 'https://cdn.example/thumb.png'
          }
        ]
      })
    )

    const items = await fetchCollectionItems(cleanCollection(), identity)

    expect(items[0].thumbnail).toBe('https://cdn.example/thumb.png')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('and item-level published/approved flags are missing it should inherit the collection flags', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          {
            id: 'inherit',
            collection_id: 'col-1',
            blockchain_item_id: '9',
            name: 'Inheritor',
            rarity: 'rare',
            total_supply: '0',
            thumbnail: 'thumbnail.png',
            contents: { 'thumbnail.png': 'QmZ' }
            // no is_published / is_approved
          }
        ]
      })
    )

    const items = await fetchCollectionItems(cleanCollection({ isPublished: true, isApproved: true }), identity)

    expect(items[0].isPublished).toBe(true)
    expect(items[0].isApproved).toBe(true)
    // category falls back to type default 'wearable' when no data category present.
    expect(items[0].category).toBe('wearable')
    expect(items[0].type).toBe('wearable')
  })

  it('and an unapproved item should be filtered out even if everything else is fine', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          {
            id: 'unapproved',
            collection_id: 'col-1',
            blockchain_item_id: '4',
            name: 'Pending Review',
            rarity: 'rare',
            total_supply: '0',
            is_published: true,
            is_approved: false,
            thumbnail: 'https://cdn/x.png'
          }
        ]
      })
    )

    const items = await fetchCollectionItems(cleanCollection(), identity)

    expect(items).toEqual([])
  })
})

describe('when checking whether an item is publishable', () => {
  const base: PublishableItem = {
    id: 'i',
    collectionId: 'c',
    collectionName: 'C',
    contractAddress: '0xc',
    blockchainItemId: '1',
    name: 'n',
    category: 'hat',
    rarity: 'rare',
    thumbnail: '',
    type: 'wearable',
    isPublished: true,
    isApproved: true,
    totalSupply: 0,
    maxSupply: 100,
    remainingSupply: 100,
    minters: []
  }

  it('should be publishable when published, approved, on-chain and with remaining supply', () => {
    expect(isPublishable(base)).toBe(true)
  })

  it('should not be publishable when unpublished', () => {
    expect(isPublishable({ ...base, isPublished: false })).toBe(false)
  })

  it('should not be publishable when unapproved', () => {
    expect(isPublishable({ ...base, isApproved: false })).toBe(false)
  })

  it('should not be publishable with an empty on-chain item id', () => {
    expect(isPublishable({ ...base, blockchainItemId: '' })).toBe(false)
  })

  it('should not be publishable with no remaining supply', () => {
    expect(isPublishable({ ...base, remainingSupply: 0 })).toBe(false)
  })
})

const rawItem = (id: string, collectionId: string, bid: string, name: string) => ({
  id,
  collection_id: collectionId,
  blockchain_item_id: bid,
  name,
  rarity: 'rare',
  total_supply: '0',
  is_published: true,
  is_approved: true,
  thumbnail: `https://cdn/${id}.png`
})

const twoCollections = okRes({
  data: [
    { id: 'col-1', name: 'A', contract_address: '0xaaa', is_published: true, is_approved: true },
    { id: 'col-2', name: 'B', contract_address: '0xbbb', is_published: true, is_approved: true }
  ]
})

/** Route the signed reads by URL: the two requests start together, so their order on the mock is not a contract. */
function routeSigned(routes: Record<string, unknown>) {
  signedFetchMock.mockImplementation(async (url: string) => {
    const match = Object.keys(routes).find(suffix => url.endsWith(suffix))
    if (!match) throw new Error(`unexpected signed fetch ${url}`)
    return routes[match]
  })
}

describe("when fetching every publishable item across a creator's collections", () => {
  it('should read the collections and the address-wide items together, in two requests', async () => {
    routeSigned({
      '/0xcreator/collections?is_published=true': twoCollections,
      '/0xcreator/items': okRes({
        data: [rawItem('i1', 'col-1', '0', 'One'), rawItem('i2', 'col-2', '1', 'Two')]
      })
    })

    const items = await fetchPublishableItems('0xCreator', identity)

    expect(items.map(i => i.id).sort()).toEqual(['i1', 'i2'])
    expect(signedFetchMock).toHaveBeenCalledTimes(2)
    // Contract and name come from the item's own collection, not from the first one in the list.
    expect(items.find(i => i.id === 'i2')).toMatchObject({ contractAddress: '0xbbb', collectionName: 'B' })
  })

  it("should keep the collections' order — newest first — however the address feed orders its items", async () => {
    routeSigned({
      '/0xcreator/collections?is_published=true': twoCollections,
      // The feed answers oldest collection first; the page groups by collection in the order given here.
      '/0xcreator/items': okRes({
        data: [
          rawItem('b1', 'col-2', '0', 'B one'),
          rawItem('a1', 'col-1', '0', 'A one'),
          rawItem('b2', 'col-2', '1', 'B two'),
          rawItem('a2', 'col-1', '1', 'A two')
        ]
      })
    })

    const items = await fetchPublishableItems('0xcreator', identity)

    // Collections' order first, and the feed's order kept inside each collection.
    expect(items.map(i => i.id)).toEqual(['a1', 'a2', 'b1', 'b2'])
  })

  it('should drop items whose collection is not published — drafts and third-party items', async () => {
    routeSigned({
      '/0xcreator/collections?is_published=true': twoCollections,
      '/0xcreator/items': okRes({
        data: [
          rawItem('i1', 'col-1', '0', 'One'),
          rawItem('draft', 'col-draft', '0', 'Draft'),
          { ...rawItem('orphan', 'col-1', '0', 'Orphan'), collection_id: null }
        ]
      })
    })

    const items = await fetchPublishableItems('0xcreator', identity)

    expect(items.map(i => i.id)).toEqual(['i1'])
  })

  it('and the address-wide read fails it should fall back to one read per collection and report it', async () => {
    routeSigned({
      '/0xcreator/collections?is_published=true': twoCollections,
      '/0xcreator/items': errRes(500, 'kaboom'),
      '/collections/col-1/items': okRes({ data: [rawItem('i1', 'col-1', '0', 'One')] }),
      '/collections/col-2/items': errRes(500, 'also down')
    })

    const items = await fetchPublishableItems('0xcreator', identity)

    // The healthy collection still shows; the broken one is skipped, as before.
    expect(items.map(i => i.id)).toEqual(['i1'])
    expect(captureError).toHaveBeenCalledTimes(1)
    expect(captureError.mock.calls[0][1]).toMatchObject({ flow: 'my_creations' })
  })

  it('and the creator has no published collections it should return an empty list', async () => {
    routeSigned({
      '/0xcreator/collections?is_published=true': okRes({ data: [] }),
      '/0xcreator/items': okRes({ data: [rawItem('stray', 'col-x', '0', 'Stray')] })
    })

    const items = await fetchPublishableItems('0xcreator', identity)

    expect(items).toEqual([])
    expect(captureError).not.toHaveBeenCalled()
  })
})

/**
 * The showcase clip. It is an ordinary content entry whose FILE NAME is the only thing marking it, and the
 * page treats "no clip" and "lookup failed" identically — so what these pin is that neither ever throws.
 */
describe('when looking up the showcase video of an item', () => {
  it('should resolve the video content to a storage URL', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { 'thumbnail.png': 'hash-thumb', 'video.mp4': 'hash-video' } })
    } as Response)

    expect(await fetchItemVideoUrl('0xc', '3')).toBe('https://builder.test/v1/storage/contents/hash-video')
    expect(fetchMock.mock.calls[0][0]).toBe('https://builder.test/v1/items/0xc/3/contents')
  })

  it('should find the clip when it sits inside a body-shape folder', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { 'male/game.glb': 'hash-glb', 'male/video.mp4': 'hash-video' } })
    } as Response)

    expect(await fetchItemVideoUrl('0xc', '3')).toBe('https://builder.test/v1/storage/contents/hash-video')
  })

  it('should be null when the creator uploaded no clip', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { 'thumbnail.png': 'hash-thumb', 'male/hat.glb': 'hash-glb' } })
    } as Response)

    expect(await fetchItemVideoUrl('0xc', '3')).toBeNull()
  })

  it('should be null — never a throw — when the builder is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    expect(await fetchItemVideoUrl('0xc', '3')).toBeNull()

    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response)
    expect(await fetchItemVideoUrl('0xc', '3')).toBeNull()
  })
})
