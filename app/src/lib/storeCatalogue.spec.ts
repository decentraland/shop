import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'http://mps.test' } }))

const fetchCreatorCollections = vi.fn()
vi.mock('~/lib/collections', () => ({
  fetchCreatorCollections: (...args: unknown[]) => fetchCreatorCollections(...args)
}))

import { fetchPublicCatalogue, withMissingCollections } from '~/lib/storeCatalogue'
import type { StoreCatalogueItem } from '~/lib/storeStats'

const CREATOR = '0x1111111111111111111111111111111111111111'
const KNOWN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const MISSING = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

function catalogueItem(overrides: Partial<StoreCatalogueItem> = {}): StoreCatalogueItem {
  return {
    id: 'item-1',
    collectionId: 'collection-1',
    collectionName: 'Known collection',
    contractAddress: KNOWN,
    blockchainItemId: '0',
    name: 'Known hat',
    category: 'hat',
    rarity: 'rare',
    thumbnail: '',
    type: 'wearable',
    isPublished: true,
    isApproved: true,
    totalSupply: 1,
    maxSupply: 5000,
    remainingSupply: 4999,
    minters: [],
    ...overrides
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('when filling the builder catalogue with the collections it missed', () => {
  describe('and the public catalogue has a collection the builder did not return', () => {
    it('should append that collection after the builder items', () => {
      const builder = [catalogueItem()]
      const missing = catalogueItem({ id: 'public-1', contractAddress: MISSING, name: 'Jolly hat' })

      expect(withMissingCollections(builder, [missing])).toEqual([builder[0], missing])
    })
  })

  describe('and the public catalogue repeats a collection the builder returned', () => {
    it('should keep the builder item and drop the public copy', () => {
      const builder = [catalogueItem()]
      const copy = catalogueItem({ id: 'public-1', contractAddress: KNOWN.toUpperCase().replace('0X', '0x') })

      expect(withMissingCollections(builder, [copy])).toEqual(builder)
    })
  })
})

describe('when reading the public catalogue of a creator', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    fetchCreatorCollections.mockResolvedValue({
      collections: [{ contractAddress: MISSING, name: 'METATIGER Jolly Roger' }]
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchCreatorCollections.mockReset()
  })

  describe('and the feed returns an item', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: 'public-1',
              name: 'Jolly Roger',
              contractAddress: MISSING.toUpperCase().replace('0X', '0x'),
              itemId: '0',
              category: 'hat',
              rarity: 'legendary',
              thumbnail: 'https://example.com/jolly.png',
              available: '12',
              createdAt: 1_700_000_000
            }
          ]
        })
      )
    })

    it('should map it to a catalogue item named after its collection', async () => {
      const [item] = await fetchPublicCatalogue(CREATOR)

      expect(item).toEqual(
        expect.objectContaining({
          contractAddress: MISSING,
          collectionId: '',
          collectionName: 'METATIGER Jolly Roger',
          blockchainItemId: '0',
          name: 'Jolly Roger',
          thumbnail: 'https://example.com/jolly.png',
          maxSupply: 100,
          remainingSupply: 12,
          totalSupply: 88,
          createdAt: 1_700_000_000_000
        })
      )
    })
  })

  describe('and the feed fails', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }))
    })

    it('should reject', async () => {
      await expect(fetchPublicCatalogue(CREATOR)).rejects.toThrow('fetchPublicCatalogue 500')
    })
  })

  describe('and the feed spans more than one page', () => {
    beforeEach(() => {
      const row = { name: 'Hat', contractAddress: MISSING, itemId: '0', category: 'hat', rarity: 'common' }
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ data: Array.from({ length: 100 }, (_, i) => ({ ...row, id: `a${i}` })) }))
        .mockResolvedValueOnce(jsonResponse({ data: [{ ...row, id: 'last' }] }))
    })

    it('should read every page', async () => {
      const items = await fetchPublicCatalogue(CREATOR)

      expect(items).toHaveLength(101)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })
})
