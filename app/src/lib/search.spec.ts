import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'http://market.test', peerUrl: 'http://peer.test' } }))

import { fetchSuggestions, EMPTY_SUGGESTIONS } from '~/lib/search'

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string) => ({ ok: status === 200, status, json: async () => body }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('when fetching suggestions', () => {
  it('should ask the one endpoint with the trimmed query and each section size', async () => {
    const fetchMock = mockFetch({ items: { data: [], total: 0 }, collections: { data: [] }, creators: { data: [] } })

    await fetchSuggestions('  galaxy ', { items: 3, collections: 2, creators: 1 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/v3/catalog/suggest?')
    expect(url).toContain('search=galaxy')
    expect(url).toContain('items=3')
    expect(url).toContain('collections=2')
    expect(url).toContain('creators=1')
  })

  it('should map the three sections, keeping the creator names the server resolved', async () => {
    mockFetch({
      items: {
        data: [
          {
            id: '0xabc-0',
            name: 'Galaxy Hat',
            creator: '0xAAA',
            creatorName: 'Galaxy Studio',
            contractAddress: '0xabc',
            itemId: '0',
            category: 'wearable',
            rarity: 'epic',
            network: 'MATIC',
            chainId: 80002,
            thumbnail: 'http://img/hat.png',
            data: { wearable: { category: 'hat', bodyShapes: ['BaseMale'] } }
          },
          {
            id: '0xabc-1',
            name: 'Nameless Hat',
            creator: '0xbbb',
            creatorName: null,
            contractAddress: '0xabc',
            itemId: '1',
            thumbnail: ''
          }
        ],
        total: 42
      },
      collections: {
        data: [
          {
            contractAddress: '0xcoll',
            name: 'Galaxy Collection',
            creator: '0xAAA',
            creatorName: 'Galaxy Studio',
            items: 2,
            sales: 1
          }
        ]
      },
      creators: { data: [{ address: '0xAAA', name: 'Galaxy Studio', face: null }] }
    })

    const result = await fetchSuggestions('galaxy')

    expect(result.items.map(item => [item.name, item.creatorName, item.wearableCategory])).toEqual([
      ['Galaxy Hat', 'Galaxy Studio', 'hat'],
      ['Nameless Hat', null, undefined]
    ])
    expect(result.total).toEqual(42)
    expect(result.collections).toEqual([
      {
        contractAddress: '0xcoll',
        name: 'Galaxy Collection',
        creator: '0xAAA',
        creatorName: 'Galaxy Studio',
        items: 2,
        sales: 1
      }
    ])
    expect(result.creators).toEqual([{ address: '0xaaa', name: 'Galaxy Studio', face: undefined }])
  })

  it('should drop collections and creators missing an address or a name', async () => {
    mockFetch({
      items: { data: [], total: 0 },
      collections: {
        data: [
          { contractAddress: '', name: 'Nameless' },
          { contractAddress: '0x1', name: '' }
        ]
      },
      creators: { data: [{ address: '', name: 'Nobody' }, { address: '0x2' }] }
    })

    const result = await fetchSuggestions('x y')

    expect(result.collections).toEqual([])
    expect(result.creators).toEqual([])
  })

  it('should answer empty sections for a blank query without any fetch', async () => {
    const fetchMock = mockFetch({})

    expect(await fetchSuggestions('   ')).toEqual(EMPTY_SUGGESTIONS)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('and the response is not ok it should throw with the status', async () => {
    mockFetch({}, 503)

    await expect(fetchSuggestions('galaxy')).rejects.toThrow('fetchSuggestions 503')
  })
})
