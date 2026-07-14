import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { peerUrl: 'http://peer.test' } }))

// eslint-disable-next-line import/first
import { fetchStore } from '~/lib/store'

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const URN = 'urn:decentraland:off-chain:marketplace-stores:0xabc'

// One entity as the content server returns it (array of active entities).
const entity = {
  content: [{ file: 'cover/Holy Dripz.jpg', hash: 'QmCover' }],
  metadata: {
    description: '  Wearables & scenes.  ',
    images: [{ name: 'cover', file: 'cover/Holy Dripz.jpg' }],
    links: [
      { name: 'website', url: 'https://metaskins.com' },
      { name: 'twitter', url: 'https://twitter.com/x' }
    ]
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('when fetching a creator store', () => {
  it('should POST the lowercased store URN to the content active-entities endpoint', async () => {
    const fetchMock = mockFetch(200, [entity])

    await fetchStore('0xABC')

    expect(fetchMock).toHaveBeenCalledWith('http://peer.test/content/entities/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pointers: [URN] })
    })
  })

  it('should resolve the cover file to an absolute content URL and trim the description', async () => {
    mockFetch(200, [entity])

    const store = await fetchStore('0xabc')

    expect(store.cover).toBe('http://peer.test/content/contents/QmCover')
    expect(store.description).toBe('Wearables & scenes.')
    expect(store.links.website).toBe('https://metaskins.com')
    expect(store.links.twitter).toBe('https://twitter.com/x')
    expect(store.links.discord).toBe('')
  })

  it('should leave the cover empty when the cover image has no matching content hash', async () => {
    mockFetch(200, [
      { content: [], metadata: { description: 'x', images: [{ name: 'cover', file: 'cover/missing.jpg' }], links: [] } }
    ])

    const store = await fetchStore('0xabc')

    expect(store.cover).toBe('')
    expect(store.description).toBe('x')
  })

  it('should return an empty store when no entity exists', async () => {
    mockFetch(200, [])

    const store = await fetchStore('0xabc')

    expect(store).toEqual({ cover: '', description: '', links: { website: '', twitter: '', discord: '', facebook: '' } })
  })

  it('should return an empty store on a non-ok response', async () => {
    mockFetch(500, {})

    expect((await fetchStore('0xabc')).cover).toBe('')
  })

  it('should return an empty store when fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network'))
    )

    expect((await fetchStore('0xabc')).description).toBe('')
  })
})
