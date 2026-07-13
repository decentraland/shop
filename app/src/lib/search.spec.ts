import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { nftApiUrl: 'http://nft.test', peerUrl: 'http://peer.test' } }))

// eslint-disable-next-line import/first
import { fetchCollection, fetchCollectionSuggestions, fetchCreatorSuggestions } from '~/lib/search'

// A fetch stub that routes by URL: collections / ens-names / accounts / per-address profiles.
function mockFetch(routes: {
  collections?: unknown[]
  collectionsStatus?: number
  ensNames?: Array<{ name: string; owner: string }>
  accounts?: Array<{ address: string; collections?: number }>
  profiles?: Record<string, { name?: string; face?: string } | null>
}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/v1/collections')) {
      const status = routes.collectionsStatus ?? 200
      return { ok: status === 200, status, json: async () => ({ data: routes.collections ?? [] }) }
    }
    if (url.includes('/v1/nfts')) {
      return { ok: true, status: 200, json: async () => ({ data: (routes.ensNames ?? []).map(n => ({ nft: n })) }) }
    }
    if (url.includes('/v1/accounts')) {
      return { ok: true, status: 200, json: async () => ({ data: routes.accounts ?? [] }) }
    }
    if (url.includes('/lambdas/profiles/')) {
      const address = url.split('/lambdas/profiles/')[1]
      const p = routes.profiles?.[address]
      if (p === null || p === undefined) return { ok: false, status: 404, json: async () => ({}) }
      return {
        ok: true,
        status: 200,
        json: async () => ({ avatars: [{ name: p.name, avatar: { snapshots: { face256: p.face } } }] })
      }
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

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('http://nft.test/v1/collections')
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

describe('when fetching a single collection by contract', () => {
  it('should query /v1/collections by contractAddress and return name + creator', async () => {
    const fetchMock = mockFetch({
      collections: [{ contractAddress: '0xabc', name: 'Black Dragon', creator: '0xartist' }]
    })

    const hit = await fetchCollection('0xabc')

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('http://nft.test/v1/collections')
    expect(url.searchParams.get('contractAddress')).toBe('0xabc')
    expect(hit).toEqual({ contractAddress: '0xabc', name: 'Black Dragon', creator: '0xartist' })
  })

  it('should return null when the collection is not found', async () => {
    mockFetch({ collections: [] })

    expect(await fetchCollection('0xnope')).toBeNull()
  })

  it('should default a missing name/creator to empty strings', async () => {
    mockFetch({ collections: [{ contractAddress: '0xabc' }] })

    expect(await fetchCollection('0xabc')).toEqual({ contractAddress: '0xabc', name: '', creator: '' })
  })

  it('and the response is not ok it should throw with the status', async () => {
    mockFetch({ collectionsStatus: 500 })

    await expect(fetchCollection('0xabc')).rejects.toThrow('fetchCollection 500')
  })
})

describe('when fetching creator suggestions by name', () => {
  it('should search names, gate on sellers, and resolve profiles', async () => {
    const fetchMock = mockFetch({
      ensNames: [
        { name: 'DragonSmith', owner: '0xAAA' },
        { name: 'DragonKing', owner: '0xBBB' }
      ],
      accounts: [
        { address: '0xaaa', collections: 3 }, // seller → kept
        { address: '0xbbb', collections: 0 } // not a seller → dropped
      ],
      profiles: { '0xaaa': { name: 'DragonSmith Studio', face: 'http://img/a.png' } }
    })

    const hits = await fetchCreatorSuggestions('dragon')

    expect(hits).toEqual([{ address: '0xaaa', name: 'DragonSmith Studio', face: 'http://img/a.png' }])
    // Name search hit /v1/nfts?category=ens, seller gate hit /v1/accounts.
    const urls = fetchMock.mock.calls.map(c => String(c[0]))
    expect(urls.some(u => u.includes('/v1/nfts') && u.includes('category=ens') && u.includes('search=dragon'))).toBe(true)
    expect(urls.some(u => u.includes('/v1/accounts'))).toBe(true)
  })

  it('should fall back to the matched name when the profile has no name', async () => {
    mockFetch({
      ensNames: [{ name: 'DragonWear', owner: '0xAAA' }],
      accounts: [{ address: '0xaaa', collections: 1 }],
      profiles: { '0xaaa': null } // no profile
    })

    const hits = await fetchCreatorSuggestions('dragon')

    expect(hits).toEqual([{ address: '0xaaa', name: 'DragonWear', face: undefined }])
  })

  it('should dedupe owners and keep the first matched name per owner', async () => {
    mockFetch({
      ensNames: [
        { name: 'DragonOne', owner: '0xAAA' },
        { name: 'DragonTwo', owner: '0xAAA' } // same owner, second name ignored
      ],
      accounts: [{ address: '0xaaa', collections: 2 }],
      profiles: { '0xaaa': null }
    })

    const hits = await fetchCreatorSuggestions('dragon')

    expect(hits).toEqual([{ address: '0xaaa', name: 'DragonOne', face: undefined }])
  })

  it('should return empty for a blank query without any fetch', async () => {
    const fetchMock = mockFetch({})

    const hits = await fetchCreatorSuggestions('   ')

    expect(hits).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should return empty when no names match', async () => {
    mockFetch({ ensNames: [] })

    const hits = await fetchCreatorSuggestions('zzz')

    expect(hits).toEqual([])
  })

  it('should return empty when no matched owner is a seller', async () => {
    mockFetch({
      ensNames: [{ name: 'DragonX', owner: '0xAAA' }],
      accounts: [{ address: '0xaaa', collections: 0 }]
    })

    const hits = await fetchCreatorSuggestions('dragon')

    expect(hits).toEqual([])
  })

  it('should cap the number of returned creators', async () => {
    mockFetch({
      ensNames: [
        { name: 'D1', owner: '0x1' },
        { name: 'D2', owner: '0x2' },
        { name: 'D3', owner: '0x3' },
        { name: 'D4', owner: '0x4' },
        { name: 'D5', owner: '0x5' }
      ],
      accounts: [
        { address: '0x1', collections: 1 },
        { address: '0x2', collections: 1 },
        { address: '0x3', collections: 1 },
        { address: '0x4', collections: 1 },
        { address: '0x5', collections: 1 }
      ],
      profiles: {}
    })

    const hits = await fetchCreatorSuggestions('d', 2)

    expect(hits).toHaveLength(2)
  })
})
