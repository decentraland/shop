import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Pin the service base so the asserted URL is stable regardless of env.
vi.mock('~/config', () => ({ config: { cameraReelUrl: 'https://camera-reel.example' } }))

import { fetchItemReel, rankReelPhotos, reelKey, type ReelPhoto } from '~/lib/reel'

const ITEM = { contractAddress: '0x0BF152a83a6fc55066c2b664b164ca2916ad38f5', itemId: '2' }
const KEY = '0x0bf152a83a6fc55066c2b664b164ca2916ad38f5-2'
const WORN = `urn:decentraland:matic:collections-v2:0x0bf152a83a6fc55066c2b664b164ca2916ad38f5:2:7`

function serviceImage(overrides: Record<string, unknown> = {}, people: Record<string, unknown>[] = [], id = 'photo-1') {
  return {
    id,
    url: 'https://camera-reel.example/photo-1.jpg',
    thumbnailUrl: 'https://camera-reel.example/photo-1-thumbnail.jpg',
    metadata: {
      userName: 'Shooter',
      userAddress: '0xaaa',
      dateTime: '1789615158',
      realm: 'main',
      scene: { name: 'Genesis Plaza', location: { x: '-3', y: '-2' } },
      visiblePeople: people,
      ...overrides
    }
  }
}

function photo(overrides: Partial<ReelPhoto> = {}): ReelPhoto {
  return {
    id: Math.random().toString(),
    url: 'u',
    thumbnailUrl: 't',
    userName: 'Shooter',
    userAddress: '0xaaa',
    wearerName: '',
    wearerAddress: '',
    place: 'Genesis Plaza',
    placeId: '',
    position: '0,0',
    realm: 'main',
    dateTime: '1000',
    people: 1,
    ...overrides
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

describe('when identifying an item for the camera reel', () => {
  it('should lowercase the contract, which the service indexes photos by', () => {
    expect(reelKey(ITEM)).toBe(KEY)
  })

  it('and the item has no itemId it should have no identity at all', () => {
    expect(reelKey({ contractAddress: '0xabc', itemId: null })).toBeNull()
  })
})

describe('when reading the photos of an item', () => {
  it('should ask the service for that item and flatten what the strip reads', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        images: [serviceImage({}, [{ userName: 'Shooter', userAddress: '0xaaa', wearables: [WORN] }])]
      })
    })

    const [photo] = await fetchItemReel(ITEM)

    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe(`/api/wearables/${KEY}/images`)
    expect(photo.place).toBe('Genesis Plaza')
    expect(photo.position).toBe('-3,-2')
    expect(photo.people).toBe(1)
  })

  it('should name the wearer only when somebody else is wearing it', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        images: [
          serviceImage(
            { userAddress: '0xaaa' },
            [
              { userName: 'Shooter', userAddress: '0xaaa', wearables: [] },
              { userName: 'Model', userAddress: '0xbbb', wearables: [WORN] }
            ],
            'by-other'
          ),
          serviceImage(
            { userAddress: '0xaaa', scene: { name: 'Elsewhere', location: { x: '1', y: '1' } } },
            [{ userName: 'Shooter', userAddress: '0xAAA', wearables: [WORN] }],
            'by-the-shooter'
          )
        ]
      })
    })

    const photos = await fetchItemReel(ITEM)
    const wornByOther = photos.find(p => p.id === 'by-other')
    const wornByTheShooter = photos.find(p => p.id === 'by-the-shooter')

    expect(wornByOther?.wearerName).toBe('Model')
    // Their own photo of their own outfit: naming them twice would say nothing.
    expect(wornByTheShooter?.wearerName).toBe('')
  })

  it('should not take another item of the same collection for this one', async () => {
    const sibling = WORN.replace(':2:7', ':12:7')
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        images: [serviceImage({}, [{ userName: 'Model', userAddress: '0xbbb', wearables: [sibling] }])]
      })
    })

    const [photo] = await fetchItemReel(ITEM)

    expect(photo.wearerName).toBe('')
  })

  it('and the item cannot be identified it should not ask at all', async () => {
    await expect(fetchItemReel({ contractAddress: '', itemId: '2' })).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('and the service fails it should throw rather than show an empty rail', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    await expect(fetchItemReel(ITEM)).rejects.toThrow('fetchItemReel 500')
  })
})

describe('when ranking the photos of an item', () => {
  it('should put the emptiest shots first, because a crowd says nothing about the item', () => {
    const ranked = rankReelPhotos([
      photo({ id: 'crowd', people: 12, userAddress: '0x1', place: 'a' }),
      photo({ id: 'solo', people: 1, userAddress: '0x2', place: 'b' }),
      photo({ id: 'pair', people: 2, userAddress: '0x3', place: 'c' })
    ])

    expect(ranked.map(p => p.id)).toEqual(['solo', 'pair', 'crowd'])
  })

  it('should prefer the newest of two equally empty shots', () => {
    const ranked = rankReelPhotos([
      photo({ id: 'old', people: 1, dateTime: '1000', userAddress: '0x1', place: 'a' }),
      photo({ id: 'new', people: 1, dateTime: '2000', userAddress: '0x2', place: 'b' })
    ])

    expect(ranked.map(p => p.id)).toEqual(['new', 'old'])
  })

  it('should never take the same person in the same place twice', () => {
    const ranked = rankReelPhotos([
      photo({ id: 'first', userAddress: '0x1', place: 'Prime Drive', dateTime: '2000' }),
      photo({ id: 'again', userAddress: '0x1', place: 'Prime Drive', dateTime: '1000' })
    ])

    expect(ranked.map(p => p.id)).toEqual(['first'])
  })

  it('should tell apart two scenes that share a name', () => {
    const ranked = rankReelPhotos([
      photo({ id: 'here', userAddress: '0x1', place: 'Plaza', placeId: 'p-1', dateTime: '2000' }),
      photo({ id: 'there', userAddress: '0x1', place: 'Plaza', placeId: 'p-2', dateTime: '1000' })
    ])

    expect(ranked.map(p => p.id)).toEqual(['here', 'there'])
  })

  it('should cap how much of the strip one person or one place can take', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      photo({ id: `p${i}`, userAddress: '0x1', place: `place-${i}`, dateTime: String(i) })
    )

    expect(rankReelPhotos(many)).toHaveLength(2)

    const sameePlace = Array.from({ length: 8 }, (_, i) =>
      photo({ id: `q${i}`, userAddress: `0x${i}`, place: 'one place', dateTime: String(i) })
    )

    expect(rankReelPhotos(sameePlace)).toHaveLength(2)
  })

  it('should hand back at most a stripful', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      photo({ id: `r${i}`, userAddress: `0x${i}`, place: `place-${i}` })
    )

    expect(rankReelPhotos(many)).toHaveLength(10)
  })
})
