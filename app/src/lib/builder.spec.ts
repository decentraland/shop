import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'

// signed-fetch (ADR-44) is the READ path for the creator's collections/items. Capture the URLs it's
// called with and return whatever the current test queued.
const signedFetchMock = vi.fn()
vi.mock('decentraland-crypto-fetch', () => ({ default: (...args: unknown[]) => signedFetchMock(...args) }))

// Stable builder base so URL assertions are deterministic.
vi.mock('~/config', () => ({ config: { builderServerUrl: 'https://builder.test' } }))

import {
  fetchCreatorCollections,
  fetchCollectionItems,
  fetchPublishableItems,
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

describe("when fetching every publishable item across a creator's collections", () => {
  it('should flatten items from all published collections', async () => {
    // 1) collections call
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          { id: 'col-1', name: 'A', contract_address: '0xaaa', is_published: true, is_approved: true },
          { id: 'col-2', name: 'B', contract_address: '0xbbb', is_published: true, is_approved: true }
        ]
      })
    )
    // 2) items for col-1
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          {
            id: 'i1',
            collection_id: 'col-1',
            blockchain_item_id: '0',
            name: 'One',
            rarity: 'rare',
            total_supply: '0',
            is_published: true,
            is_approved: true,
            thumbnail: 'https://cdn/1.png'
          }
        ]
      })
    )
    // 3) items for col-2
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          {
            id: 'i2',
            collection_id: 'col-2',
            blockchain_item_id: '1',
            name: 'Two',
            rarity: 'epic',
            total_supply: '0',
            is_published: true,
            is_approved: true,
            thumbnail: 'https://cdn/2.png'
          }
        ]
      })
    )

    const items = await fetchPublishableItems('0xcreator', identity)

    expect(items.map(i => i.id).sort()).toEqual(['i1', 'i2'])
  })

  it('should fail-soft per collection so one bad response does not hide the rest', async () => {
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          { id: 'col-ok', name: 'OK', contract_address: '0xok', is_published: true, is_approved: true },
          { id: 'col-bad', name: 'Bad', contract_address: '0xbad', is_published: true, is_approved: true }
        ]
      })
    )
    // col-ok items
    signedFetchMock.mockResolvedValueOnce(
      okRes({
        data: [
          {
            id: 'good',
            collection_id: 'col-ok',
            blockchain_item_id: '0',
            name: 'Good',
            rarity: 'rare',
            total_supply: '0',
            is_published: true,
            is_approved: true,
            thumbnail: 'https://cdn/g.png'
          }
        ]
      })
    )
    // col-bad items → server error, swallowed
    signedFetchMock.mockResolvedValueOnce(errRes(500, 'kaboom'))

    const items = await fetchPublishableItems('0xcreator', identity)

    expect(items.map(i => i.id)).toEqual(['good'])
  })

  it('and the creator has no published collections it should return an empty list', async () => {
    signedFetchMock.mockResolvedValueOnce(okRes({ data: [] }))

    const items = await fetchPublishableItems('0xcreator', identity)

    expect(items).toEqual([])
    // Only the collections call fired; no per-collection item fetches.
    expect(signedFetchMock).toHaveBeenCalledTimes(1)
  })
})
