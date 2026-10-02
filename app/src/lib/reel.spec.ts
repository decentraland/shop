import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Pin the service base so the asserted URL is stable regardless of env.
vi.mock('~/config', () => ({ config: { cameraReelUrl: 'https://camera-reel.example' } }))
// The hiding rules come from the Catalyst; each test says what it answers, and by default it knows nothing.
const fetchWearableRules = vi.fn()
vi.mock('~/lib/wearable-rules', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/wearable-rules')>()),
  fetchWearableRules: (urns: string[]) => fetchWearableRules(urns)
}))

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
    wearerWearables: [],
    itemUrn: '',
    itemCategory: '',
    wearerRect: null,
    wearerOffPhoto: false,
    otherRects: [],
    ...overrides
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchWearableRules.mockReset()
  fetchWearableRules.mockResolvedValue([])
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

  it('should leave out a photo where another piece the wearer has on hides the item', async () => {
    const ITEM_URN = WORN.replace(':7', '')
    const ROBE = 'urn:decentraland:matic:collections-v2:0xrobe:0'
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        images: [
          serviceImage(
            {},
            [{ userName: 'Robed', userAddress: '0xbbb', wearables: [`${ROBE}:3`, WORN] }],
            'under-a-robe'
          ),
          serviceImage(
            { scene: { name: 'Elsewhere', location: { x: '1', y: '1' } } },
            [{ userName: 'Plain', userAddress: '0xccc', wearables: [WORN] }],
            'on-show'
          )
        ]
      })
    })
    fetchWearableRules.mockResolvedValue([
      { urn: ITEM_URN, category: 'lower_body', hides: [], replaces: [] },
      { urn: ROBE, category: 'upper_body', hides: ['lower_body'], replaces: [] }
    ])

    const photos = await fetchItemReel(ITEM)

    expect(fetchWearableRules).toHaveBeenCalledWith(expect.arrayContaining([ITEM_URN, ROBE]))
    expect(photos.map(p => p.id)).toEqual(['on-show'])
  })

  it('and the hiding rules cannot be read it should keep the photos', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        images: [serviceImage({}, [{ userName: 'Robed', userAddress: '0xbbb', wearables: [WORN] }])]
      })
    })

    await expect(fetchItemReel(ITEM)).resolves.toHaveLength(1)
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
  it('should put the emptiest shots first, because the fewer people the easier the item is to see', () => {
    const ranked = rankReelPhotos([
      photo({ id: 'group', people: 4, userAddress: '0x1', place: 'a' }),
      photo({ id: 'solo', people: 1, userAddress: '0x2', place: 'b' }),
      photo({ id: 'pair', people: 2, userAddress: '0x3', place: 'c' })
    ])

    expect(ranked.map(p => p.id)).toEqual(['solo', 'pair', 'group'])
  })

  it('should put photos that frame the wearer well before those with no rectangle', () => {
    const ranked = rankReelPhotos([
      photo({ id: 'portrait-no-rect', people: 1, userAddress: '0x1', place: 'a', dateTime: '3000' }),
      photo({
        id: 'framed',
        people: 4,
        userAddress: '0x2',
        place: 'b',
        dateTime: '1000',
        wearerRect: { x: 0.35, y: 0.2, width: 0.3, height: 0.6 }
      })
    ])

    expect(ranked.map(p => p.id)).toEqual(['framed', 'portrait-no-rect'])
  })

  it('should keep a crowd shot whose wearer is large in the frame, with smaller people behind them', () => {
    const wearerRect = { x: 0.3, y: 0.1, width: 0.35, height: 0.8 }
    const background = Array.from({ length: 14 }, (_, i) => ({
      x: 0.3 + (i % 7) * 0.05,
      y: 0.2 + Math.floor(i / 7) * 0.2,
      width: 0.05,
      height: 0.2
    }))
    const ranked = rankReelPhotos([
      photo({ id: 'party', people: 30, itemCategory: 'upper_body', wearerRect, otherRects: background })
    ])

    expect(ranked.map(p => p.id)).toEqual(['party'])
  })

  it('should drop a photo with a rectangle that frames the wearer badly, however few people are in it', () => {
    const ranked = rankReelPhotos([
      photo({
        id: 'tiny',
        people: 1,
        userAddress: '0x1',
        place: 'a',
        wearerRect: { x: 0.45, y: 0.4, width: 0.05, height: 0.1 }
      }),
      photo({
        id: 'feet-cut',
        people: 1,
        userAddress: '0x2',
        place: 'b',
        itemCategory: 'feet',
        wearerRect: { x: 0.4, y: 0.3, width: 0.2, height: 0.7 }
      })
    ])

    expect(ranked).toEqual([])
  })

  it('should drop a photo whose wearer the client placed outside the saved crop', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        images: [
          serviceImage({}, [
            {
              userName: 'Out',
              userAddress: '0xbbb',
              wearables: [WORN],
              screenRect: { x: 0, y: 0, width: 0, height: 0 }
            }
          ])
        ]
      })
    })

    await expect(fetchItemReel(ITEM)).resolves.toEqual([])
  })

  it('should leave crowds out, where the item is a speck', () => {
    const ranked = rankReelPhotos([
      photo({ id: 'five', people: 5, userAddress: '0x1', place: 'a' }),
      photo({ id: 'six', people: 6, userAddress: '0x2', place: 'b' }),
      photo({ id: 'party', people: 32, userAddress: '0x3', place: 'c' })
    ])

    expect(ranked.map(p => p.id)).toEqual(['five'])
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

    const samePlace = Array.from({ length: 8 }, (_, i) =>
      photo({ id: `q${i}`, userAddress: `0x${i}`, place: 'one place', dateTime: String(i) })
    )

    expect(rankReelPhotos(samePlace)).toHaveLength(2)
  })

  it('should hand back at most a stripful', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      photo({ id: `r${i}`, userAddress: `0x${i}`, place: `place-${i}` })
    )

    expect(rankReelPhotos(many)).toHaveLength(10)
  })
})
