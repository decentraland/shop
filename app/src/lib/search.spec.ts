import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'http://market.test', peerUrl: 'http://peer.test' } }))

import { fetchCollectionSuggestions, fetchCreatorSuggestions } from '~/lib/search'

// A fetch stub that routes by URL: collections / creators.
function mockFetch(routes: {
  collections?: unknown[]
  collectionsStatus?: number
  creators?: Array<{ address: string; name: string; face?: string | null }>
  creatorsStatus?: number
}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/v1/collections')) {
      const status = routes.collectionsStatus ?? 200
      return { ok: status === 200, status, json: async () => ({ data: routes.collections ?? [] }) }
    }
    if (url.includes('/v3/catalog/creators/search')) {
      const status = routes.creatorsStatus ?? 200
      return { ok: status === 200, status, json: async () => ({ data: routes.creators ?? [] }) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('when fetching collection suggestions', () => {
  it('should call /v1/collections with the search term and a small page', async () => {
    const fetchMock = mockFetch({ collections: [] })

    await fetchCollectionSuggestions('dragon')

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe('http://market.test/v1/collections')
    expect(url.searchParams.get('search')).toBe('dragon')
    expect(url.searchParams.get('first')).toBe('4')
  })

  it('should map matching collections to name + contract + creator', async () => {
    mockFetch({ collections: [{ contractAddress: '0xabc', name: 'Black Dragon', creator: '0xartist' }] })

    const hits = await fetchCollectionSuggestions('dragon')

    expect(hits).toEqual([{ contractAddress: '0xabc', name: 'Black Dragon', creator: '0xartist' }])
  })

  it('should drop rows missing a contract or name', async () => {
    mockFetch({
      collections: [
        { contractAddress: '0xabc', name: 'Good', creator: '0x1' },
        { contractAddress: '', name: 'No contract', creator: '0x2' },
        { contractAddress: '0xdef', name: '', creator: '0x3' }
      ]
    })

    const hits = await fetchCollectionSuggestions('x')

    expect(hits.map(h => h.name)).toEqual(['Good'])
  })

  it('and the response is not ok it should throw with the status', async () => {
    mockFetch({ collectionsStatus: 503 })

    await expect(fetchCollectionSuggestions('dragon')).rejects.toThrow('fetchCollectionSuggestions 503')
  })
})

describe('when fetching creator suggestions', () => {
  it('should ask the server for ranked creators with the trimmed query and a small page', async () => {
    const fetchMock = mockFetch({
      creators: [
        { address: '0xAAA', name: 'Galaxy Studio', face: 'http://img/a.png' },
        { address: '0xbbb', name: 'Galaxy Crew', face: null }
      ]
    })

    const hits = await fetchCreatorSuggestions('  galaxy ', 2)

    expect(hits).toEqual([
      { address: '0xaaa', name: 'Galaxy Studio', face: 'http://img/a.png' },
      { address: '0xbbb', name: 'Galaxy Crew', face: undefined }
    ])
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/v3/catalog/creators/search?')
    expect(url).toContain('search=galaxy')
    expect(url).toContain('first=2')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('should drop rows missing an address or a name', async () => {
    mockFetch({
      creators: [
        { address: '', name: 'Nobody' },
        { address: '0xccc', name: '' },
        { address: '0xddd', name: 'Someone' }
      ]
    })

    const hits = await fetchCreatorSuggestions('some')

    expect(hits).toEqual([{ address: '0xddd', name: 'Someone', face: undefined }])
  })

  it('should return empty for a blank query without any fetch', async () => {
    const fetchMock = mockFetch({})

    const hits = await fetchCreatorSuggestions('   ')

    expect(hits).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should return empty when nothing matches', async () => {
    mockFetch({ creators: [] })

    expect(await fetchCreatorSuggestions('zzz')).toEqual([])
  })

  it('and the response is not ok it should throw with the status', async () => {
    mockFetch({ creatorsStatus: 503 })

    await expect(fetchCreatorSuggestions('galaxy')).rejects.toThrow('fetchCreatorSuggestions 503')
  })
})
