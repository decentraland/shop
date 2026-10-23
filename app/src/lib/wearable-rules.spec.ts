import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { peerUrl: 'https://peer.test' } }))

import {
  fetchWearableRules,
  fetchWearableTraits,
  keepEquipped,
  faceOnly,
  hiddenBy,
  type WearableRule
} from '~/lib/wearable-rules'

// Categories stay plain strings at the call sites (they read as the Catalyst writes them); the cast is
// the same trust the wire type takes.
function rule(urn: string, category: string, hides: string[] = [], replaces: string[] = []): WearableRule {
  return { urn, category: category as WearableRule['category'], hides, replaces }
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

describe('what an equipped wearable hides', () => {
  it('should be what it declares, from either field', () => {
    expect([...hiddenBy(rule('a', 'upper_body', ['hands'], ['hands_wear']))]).toEqual(['hands', 'hands_wear'])
  })

  /**
   * The case the fitting room was failing on. A real skin declares the accessory slots it hides (hat, mask,
   * eyewear…) and says nothing about the body it plainly covers, so reading `hides` alone left it sitting on
   * top of every body wearable.
   */
  it('should include the whole body for a skin, declared or not', () => {
    const skin = rule('s', 'skin', ['hat', 'mask'])
    const hidden = hiddenBy(skin)
    expect(hidden.has('hat')).toBe(true)
    for (const body of ['upper_body', 'lower_body', 'feet', 'hair']) expect(hidden.has(body)).toBe(true)
  })
})

describe('when deciding which of the avatar’s wearables stay on', () => {
  it('should drop the skin that would hide the item being tried on', () => {
    const equipped = [rule('skin-urn', 'skin', ['hat']), rule('brows', 'eyebrows'), rule('shoes', 'feet')]

    // Trying on a hat: the skin hides hats, so it goes. Eyebrows are untouched…
    expect(keepEquipped(equipped, ['hat'])).toEqual(['brows', 'shoes'])
  })

  it('should drop an equipped wearable of the same category — that is a swap, not a conflict', () => {
    const equipped = [rule('their-hat', 'hat'), rule('their-shirt', 'upper_body')]
    expect(keepEquipped(equipped, ['hat'])).toEqual(['their-shirt'])
  })

  it('should keep everything when nothing is in the way', () => {
    const equipped = [rule('brows', 'eyebrows'), rule('shoes', 'feet')]
    expect(keepEquipped(equipped, ['hat'])).toEqual(['brows', 'shoes'])
  })

  it('should keep everything when nothing is being tried on', () => {
    const equipped = [rule('skin-urn', 'skin'), rule('brows', 'eyebrows')]
    expect(keepEquipped(equipped, [])).toEqual(['skin-urn', 'brows'])
  })

  it('should preserve the avatar’s own order', () => {
    const equipped = [rule('a', 'eyebrows'), rule('b', 'mouth'), rule('c', 'feet')]
    expect(keepEquipped(equipped, ['hat'])).toEqual(['a', 'b', 'c'])
  })
})

describe('when deciding what an outfit preview borrows from the avatar', () => {
  it('should keep the face and drop everything else', () => {
    const equipped = [
      rule('their-hat', 'hat'),
      rule('their-eyes', 'eyes'),
      rule('their-hair', 'hair'),
      rule('their-brows', 'eyebrows'),
      rule('their-shoes', 'feet'),
      rule('their-mouth', 'mouth'),
      rule('their-shirt', 'upper_body')
    ]

    expect(faceOnly(equipped)).toEqual(['their-eyes', 'their-brows', 'their-mouth'])
  })

  /** The hair COLOUR is kept (it travels with the other colours) — the hairstyle is a wearable, so it goes. */
  it('should not treat hair or facial hair as part of the face', () => {
    expect(faceOnly([rule('h', 'hair'), rule('b', 'facial_hair')])).toEqual([])
  })

  it('should preserve the avatar’s own order', () => {
    expect(faceOnly([rule('m', 'mouth'), rule('e', 'eyes')])).toEqual(['m', 'e'])
  })

  it('should answer with nothing when the Catalyst told us nothing', () => {
    expect(faceOnly([])).toEqual([])
  })
})

describe('when reading the rules from the Catalyst', () => {
  it('should ask for every urn at once and answer in that order', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        { pointers: ['urn:b'], metadata: { data: { category: 'feet', hides: [] } } },
        { pointers: ['urn:a'], metadata: { data: { category: 'skin', hides: ['hat'], replaces: ['head'] } } }
      ]
    } as Response)

    const rules = await fetchWearableRules(['urn:a', 'urn:b'])

    expect(rules.map(r => r.urn)).toEqual(['urn:a', 'urn:b'])
    expect(rules[0]).toEqual({ urn: 'urn:a', category: 'skin', hides: ['hat'], replaces: ['head'] })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://peer.test/content/entities/active')
    const body = (init as RequestInit).body
    expect(JSON.parse(typeof body === 'string' ? body : '')).toEqual({ pointers: ['urn:a', 'urn:b'] })
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('should skip an urn the Catalyst does not know rather than invent a rule for it', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [{ pointers: ['urn:a'], metadata: { data: { category: 'hat' } } }]
    } as Response)

    expect((await fetchWearableRules(['urn:a', 'urn:missing'])).map(r => r.urn)).toEqual(['urn:a'])
  })

  /**
   * Dressing the avatar must not depend on this call. An empty list is the "know nothing" answer, and every
   * caller then leaves the avatar exactly as it was.
   */
  it('should answer with nothing — never throw — when the Catalyst fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    expect(await fetchWearableRules(['urn:a'])).toEqual([])

    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, json: async () => [] } as Response)
    expect(await fetchWearableRules(['urn:a'])).toEqual([])
  })

  it('should not call out at all for an empty list', async () => {
    expect(await fetchWearableRules([])).toEqual([])
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})

// `blockVrmExport` and `hides` live on the entity and on no marketplace endpoint, which is why they have their own read.
describe('when reading the item page traits off the wearable entity', () => {
  const entity = (data: Record<string, unknown>) =>
    ({
      ok: true,
      json: async () => [{ pointers: ['urn:a'], metadata: { data: { category: 'hat', ...data } } }]
    }) as Response

  it('should report the VRM flag the creator set', async () => {
    vi.mocked(fetch).mockResolvedValue(entity({ blockVrmExport: true }))
    expect((await fetchWearableTraits('urn:a')).vrmBlocked).toBe(true)
  })

  it('should report VRM export as allowed when the flag is absent — most wearables allow it', async () => {
    vi.mocked(fetch).mockResolvedValue(entity({}))
    expect((await fetchWearableTraits('urn:a')).vrmBlocked).toBe(false)
  })

  it('should list what it hides and replaces once each, without its own category', async () => {
    vi.mocked(fetch).mockResolvedValue(
      entity({ hides: ['eyebrows', 'hat', 'eyewear'], replaces: ['eyewear', 'tiara'] })
    )
    expect((await fetchWearableTraits('urn:a')).hides).toEqual(['eyebrows', 'eyewear', 'tiara'])
  })

  /**
   * Null, not false: "we could not find out" and "export is allowed" are different answers, and the page shows
   * the badge on neither — but only the first should ever be retried or reasoned about as unknown.
   */
  it('should answer unknown when the item or the Catalyst cannot be read', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response)
    expect(await fetchWearableTraits('urn:a')).toEqual({ vrmBlocked: null, hides: [] })

    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    expect(await fetchWearableTraits('urn:a')).toEqual({ vrmBlocked: null, hides: [] })
  })
})
