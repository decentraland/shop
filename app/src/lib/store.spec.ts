import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { peerUrl: 'http://peer.test' } }))
vi.mock('~/lib/monitoring', () => ({ captureError: vi.fn() }))

// Stub the lazily-imported catalyst client + entity builder so saveStore runs without a network.
// Declared via vi.hoisted so they exist before the (hoisted) vi.mock factories reference them.
const { buildEntity, deploy, createContentClient, signPayload } = vi.hoisted(() => ({
  buildEntity: vi.fn(async (_opts: unknown) => ({ entityId: 'bafyEntity', files: new Map() })),
  deploy: vi.fn(async (_data: unknown) => ({})),
  createContentClient: vi.fn((_opts: unknown) => ({}) as { deploy: unknown }),
  signPayload: vi.fn(() => [{ type: 'SIGNER', payload: '0xowner', signature: '' }])
}))
createContentClient.mockImplementation(() => ({ deploy }))
vi.mock('dcl-catalyst-client/dist/client/utils/DeploymentBuilder', () => ({ buildEntity }))
vi.mock('dcl-catalyst-client/dist/client/ContentClient', () => ({ createContentClient }))
vi.mock('@dcl/crypto', () => ({ Authenticator: { signPayload } }))
const hashV1 = vi.hoisted(() => vi.fn(async (_bytes: Uint8Array) => 'bafyTemplateHash'))
vi.mock('@dcl/hashing', () => ({ hashV1 }))

// eslint-disable-next-line import/first
import {
  fetchStore,
  buildStoreMetadata,
  isValidLink,
  draftFromStore,
  saveStore,
  templateHash,
  type StoreDraft
} from '~/lib/store'

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
    expect(store.coverHash).toBe('QmCover')
    expect(store.description).toBe('Wearables & scenes.')
    expect(store.links.website).toBe('https://metaskins.com')
    expect(store.links.twitter).toBe('https://twitter.com/x')
    expect(store.links.discord).toBe('')
  })

  it('should leave the cover empty when the cover image has no matching content hash', async () => {
    mockFetch(200, [
      {
        content: [],
        metadata: { description: 'x', images: [{ name: 'cover', file: 'cover/missing.jpg' }], links: [] }
      }
    ])

    const store = await fetchStore('0xabc')

    expect(store.cover).toBe('')
    expect(store.description).toBe('x')
  })

  it('should return an empty store when no entity exists', async () => {
    mockFetch(200, [])

    const store = await fetchStore('0xabc')

    expect(store).toEqual({
      cover: '',
      coverHash: '',
      description: '',
      links: { website: '', twitter: '', discord: '', facebook: '' }
    })
  })

  it('should return an empty store on a non-ok response', async () => {
    mockFetch(500, {})

    expect((await fetchStore('0xabc')).cover).toBe('')
  })

  it('should return an empty store when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    expect((await fetchStore('0xabc')).description).toBe('')
  })
})

function draft(overrides: Partial<StoreDraft> = {}): StoreDraft {
  return {
    cover: '',
    coverName: '',
    coverHash: '',
    description: '',
    links: { website: '', twitter: '', discord: '', facebook: '' },
    ...overrides
  }
}

describe('when building store entity metadata', () => {
  it('should lowercase the owner and set the URN id and version 1', () => {
    const meta = buildStoreMetadata('0xABC', draft())
    expect(meta.id).toBe(URN)
    expect(meta.owner).toBe('0xabc')
    expect(meta.version).toBe(1)
  })

  it('should drop empty links and keep only the filled ones, in order', () => {
    const meta = buildStoreMetadata(
      '0xabc',
      draft({ links: { website: 'https://x.com', twitter: '', discord: 'https://discord.gg/y', facebook: '' } })
    )
    expect(meta.links).toEqual([
      { name: 'website', url: 'https://x.com' },
      { name: 'discord', url: 'https://discord.gg/y' }
    ])
  })

  it('should include the cover image only when both url and file name are present', () => {
    expect(buildStoreMetadata('0xabc', draft({ cover: 'data:image/x', coverName: '' })).images).toEqual([])
    expect(buildStoreMetadata('0xabc', draft({ cover: 'data:image/x', coverName: 'cover/a.jpeg' })).images).toEqual([
      { name: 'cover', file: 'cover/a.jpeg' }
    ])
  })
})

describe('when validating a link', () => {
  it('should treat empty as valid', () => {
    expect(isValidLink('website', '')).toBe(true)
  })
  it('should require the type prefix', () => {
    expect(isValidLink('website', 'http://x.com')).toBe(false)
    expect(isValidLink('website', 'https://x.com')).toBe(true)
    expect(isValidLink('twitter', 'https://www.twitter.com/me')).toBe(true)
    expect(isValidLink('discord', 'nope')).toBe(false)
  })
})

describe('when converting a read store into an editable draft', () => {
  it('should derive a cover/<basename> file name and carry the content hash through', () => {
    const d = draftFromStore({
      cover: 'http://peer.test/content/contents/QmCover',
      coverHash: 'QmCover',
      description: 'hi',
      links: { website: '', twitter: '', discord: '', facebook: '' }
    })
    expect(d.coverName).toBe('cover/QmCover')
    expect(d.coverHash).toBe('QmCover')
  })
  it('should leave the cover name empty when there is no cover', () => {
    const d = draftFromStore({
      cover: '',
      coverHash: '',
      description: '',
      links: { website: '', twitter: '', discord: '', facebook: '' }
    })
    expect(d.coverName).toBe('')
  })
})

describe('when hashing a cover template', () => {
  it('should fetch the template bytes and hash them, memoizing per URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) })
    vi.stubGlobal('fetch', fetchMock)
    hashV1.mockClear()

    const a = await templateHash('http://cdn/unique-template.jpeg')
    const b = await templateHash('http://cdn/unique-template.jpeg')

    expect(a).toBe('bafyTemplateHash')
    expect(b).toBe('bafyTemplateHash')
    // Memoized: fetched + hashed only once despite two calls for the same URL.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(hashV1).toHaveBeenCalledTimes(1)
  })
})

describe('when saving a store', () => {
  const identity = {} as never

  beforeEach(() => {
    buildEntity.mockClear()
    deploy.mockClear()
    signPayload.mockClear()
    createContentClient.mockClear()
  })

  it('should build a STORE entity, fetch the cover into the files map, sign it and deploy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(4) }))

    await saveStore(
      '0xABC',
      draft({ cover: 'http://img/x.jpeg', coverName: 'cover/x.jpeg', description: 'hey' }),
      identity
    )

    const arg = buildEntity.mock.calls[0][0] as {
      type: string
      pointers: string[]
      files: Map<string, Uint8Array>
    }
    expect(arg.type).toBe('store')
    expect(arg.pointers).toEqual([URN])
    expect(arg.files.get('cover/x.jpeg')).toBeInstanceOf(Uint8Array)
    expect(signPayload).toHaveBeenCalledWith(identity, 'bafyEntity')
    expect(deploy).toHaveBeenCalledTimes(1)

    // The content client must get a callable fetcher whose fetch stays bound to the global — passing
    // the bare window.fetch throws "Illegal invocation" in the browser. Guard against that regression.
    const opts = createContentClient.mock.calls[0][0] as { url: string; fetcher: { fetch: unknown } }
    expect(opts.url).toBe('http://peer.test/content')
    expect(typeof opts.fetcher.fetch).toBe('function')
  })

  it('should not fetch a cover when none is set', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await saveStore('0xabc', draft({ description: 'no cover' }), identity)

    expect(fetchMock).not.toHaveBeenCalled()
    const arg = buildEntity.mock.calls[0][0] as { files: Map<string, Uint8Array> }
    expect(arg.files.size).toBe(0)
  })

  it('should throw a generic save-failed error (never a raw cause) when deploy fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(0) }))
    deploy.mockRejectedValueOnce(new Error('catalyst 401 signature invalid'))

    await expect(
      saveStore('0xabc', draft({ cover: 'http://img/x.jpeg', coverName: 'cover/x.jpeg' }), identity)
    ).rejects.toThrow('save-failed')
  })
})
