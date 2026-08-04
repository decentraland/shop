import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { peerUrl: 'https://peer.test' } }))

import { fetchWearableRules, keepEquipped, hiddenBy, type WearableRule } from '~/lib/wearable-rules'

function rule(urn: string, category: string, hides: string[] = [], replaces: string[] = []): WearableRule {
  return { urn, category, hides, replaces }
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
