import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { peerUrl: 'https://peer.test', chainId: 80002 } }))

import { fetchEmoteBase64, isEmoteUrn, toEmoteBase64 } from '~/lib/emoteBase64'

const PEER = 'https://peer.test'
const MATIC_EMOTE = 'urn:decentraland:matic:collections-v2:0xabc:0'
const AMOY_EMOTE = 'urn:decentraland:amoy:collections-v2:0xabc:0'

function emoteEntity(overrides: Record<string, unknown> = {}) {
  return {
    content: [
      { file: 'male/emote.glb', hash: 'Qm-male' },
      { file: 'female/emote.glb', hash: 'Qm-female' },
      { file: 'thumbnail.png', hash: 'Qm-thumb' }
    ],
    metadata: {
      id: 'urn:decentraland:matic:collections-v2:0xabc:0',
      name: 'Dance',
      emoteDataADR74: {
        category: 'dance',
        loop: true,
        representations: [
          {
            bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseMale'],
            mainFile: 'male/emote.glb',
            contents: ['male/emote.glb']
          },
          {
            bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseFemale'],
            mainFile: 'female/emote.glb',
            contents: ['female/emote.glb']
          }
        ]
      }
    },
    ...overrides
  }
}

function decode(playback: { base64: string } | null) {
  return JSON.parse(atob(playback!.base64))
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

describe('when telling a published emote from a built-in one', () => {
  it('should read a urn as published', () => {
    expect(isEmoteUrn('urn:decentraland:matic:collections-v2:0xabc:0')).toBe(true)
  })

  it('should read an animation name as built-in', () => {
    expect(isEmoteUrn('fashion')).toBe(false)
  })
})

describe('when turning an emote entity into a definition', () => {
  it('should point every content file at the catalyst that holds it', () => {
    const definition = decode(toEmoteBase64(emoteEntity(), PEER))

    expect(definition.emoteDataADR74.representations[0].contents).toEqual([
      { key: 'male/emote.glb', url: `${PEER}/content/contents/Qm-male` }
    ])
    expect(definition.emoteDataADR74.representations[1].contents).toEqual([
      { key: 'female/emote.glb', url: `${PEER}/content/contents/Qm-female` }
    ])
  })

  it('should keep the rest of the metadata as the renderer expects it', () => {
    const definition = decode(toEmoteBase64(emoteEntity(), PEER))

    expect(definition.id).toBe('urn:decentraland:matic:collections-v2:0xabc:0')
    expect(definition.emoteDataADR74.loop).toBe(true)
    expect(definition.emoteDataADR74.representations[0].mainFile).toBe('male/emote.glb')
    // No `data` block: that field is what the renderer reads as "this is a wearable, not an emote".
    expect(definition.data).toBeUndefined()
  })

  /** btoa throws on anything outside Latin-1, and creators do put emoji in emote names. */
  it('should survive a name the encoding cannot carry', () => {
    const entity = emoteEntity()
    entity.metadata.name = 'Dance 💃'

    const definition = decode(toEmoteBase64(entity, PEER))
    expect(definition.name).toBe('Dance ')
  })

  it('should drop content the entity holds no hash for, rather than link a broken url', () => {
    const entity = emoteEntity()
    entity.metadata.emoteDataADR74.representations[0].contents = ['male/emote.glb', 'ghost.glb']

    const definition = decode(toEmoteBase64(entity, PEER))
    expect(definition.emoteDataADR74.representations[0].contents).toHaveLength(1)
  })

  /**
   * Reported alongside the definition because the preview never reads it from `base64s`: with no loop flag
   * of its own the playback bar assumed the default (looping) emote and ran a play-once emote forever.
   */
  it('should report whether the emote loops', () => {
    expect(toEmoteBase64(emoteEntity(), PEER)?.loop).toBe(true)

    const once = emoteEntity()
    once.metadata.emoteDataADR74.loop = false
    expect(toEmoteBase64(once, PEER)?.loop).toBe(false)

    const unstated = emoteEntity()
    delete (unstated.metadata.emoteDataADR74 as { loop?: boolean }).loop
    expect(toEmoteBase64(unstated, PEER)?.loop).toBe(false)
  })

  it('should refuse a wearable', () => {
    expect(toEmoteBase64({ content: [], metadata: { data: { category: 'hat' } } }, PEER)).toBeNull()
  })

  it('should refuse an emote with no representation to load', () => {
    expect(toEmoteBase64({ content: [], metadata: { emoteDataADR74: { representations: [] } } }, PEER)).toBeNull()
    const orphaned = emoteEntity({ content: [] })
    expect(toEmoteBase64(orphaned, PEER)).toBeNull()
  })
})

describe('when fetching an emote definition', () => {
  it('should ask the catalyst for the urn and return the definition', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({ ok: true, json: async () => [emoteEntity()] } as Response)

    const playback = await fetchEmoteBase64(MATIC_EMOTE, PEER)

    expect(fetchMock).toHaveBeenCalledWith(
      `${PEER}/content/entities/active`,
      expect.objectContaining({ method: 'POST' })
    )
    const body = JSON.parse(vi.mocked(fetchMock).mock.calls[0][1]!.body as string)
    expect(body).toEqual({ pointers: [MATIC_EMOTE] })
    expect(decode(playback).emoteDataADR74.loop).toBe(true)
  })

  /**
   * A dev build reading the mainnet catalog lists matic emotes, and those exist on the .org catalyst only —
   * asking the app's own (.zone) catalyst returned nothing and the avatar stood still.
   */
  it('should ask the catalyst of the network the urn names, not the app’s', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({ ok: true, json: async () => [emoteEntity()] } as Response)

    await fetchEmoteBase64(MATIC_EMOTE)
    expect(fetchMock.mock.calls[0][0]).toBe('https://peer.decentraland.org/content/entities/active')

    await fetchEmoteBase64(AMOY_EMOTE)
    expect(fetchMock.mock.calls[1][0]).toBe('https://peer.decentraland.zone/content/entities/active')
  })

  it('should build the content urls on that same catalyst', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [emoteEntity()] } as Response)

    const definition = decode(await fetchEmoteBase64(MATIC_EMOTE))
    expect(definition.emoteDataADR74.representations[0].contents[0].url).toBe(
      'https://peer.decentraland.org/content/contents/Qm-male'
    )
  })

  it('should answer null when the catalyst does not know the urn', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as unknown as Response)
    expect(await fetchEmoteBase64('urn:unknown')).toBeNull()
  })

  it('should answer null when the catalyst refuses', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    expect(await fetchEmoteBase64('urn:unknown')).toBeNull()
  })

  it('should answer null when the request fails outright', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    expect(await fetchEmoteBase64('urn:unknown')).toBeNull()
  })
})
