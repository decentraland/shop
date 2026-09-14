import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'

// signedFetch is the default export of decentraland-crypto-fetch; capture every call so we can
// assert URL / method / body without hitting the network. vi.hoisted keeps the fn defined before
// the hoisted vi.mock factory runs.
const { signedFetch } = vi.hoisted(() => ({ signedFetch: vi.fn() }))
vi.mock('decentraland-crypto-fetch', () => ({ default: signedFetch }))

// Pin the marketplace-server base URL so the asserted URLs are stable regardless of env.
vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'https://marketplace.example' } }))

import { DEFAULT_LIST_ID, favoriteKey, fetchFavoriteIds, fetchFavoriteStats, setFavorite } from '~/lib/favorites'

const IDENTITY = {} as AuthIdentity

function ok(json: unknown) {
  return { ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) }
}
function fail(status: number) {
  return { ok: false, status, json: async () => ({}), text: async () => 'boom' }
}

beforeEach(() => {
  signedFetch.mockReset()
})

describe('when deriving the favorite key of an item', () => {
  it('should compose the lowercased contract address with the item id', () => {
    expect(favoriteKey({ contractAddress: '0xABCdef', itemId: '3' })).toBe('0xabcdef-3')
  })

  it('and the item has no itemId it should return null', () => {
    expect(favoriteKey({ contractAddress: '0xabc', itemId: null })).toBeNull()
    expect(favoriteKey({ contractAddress: '0xabc', itemId: '' })).toBeNull()
  })

  it('and the item has no contract address it should return null', () => {
    expect(favoriteKey({ contractAddress: '', itemId: '3' })).toBeNull()
  })
})

describe('when fetching the favorited item ids', () => {
  it('should GET the default list picks signed and return the ids', async () => {
    signedFetch.mockResolvedValueOnce(
      ok({
        ok: true,
        data: {
          results: [
            { itemId: '0xa-1', createdAt: 2 },
            { itemId: '0xb-2', createdAt: 1 }
          ],
          total: 2
        }
      })
    )
    const ids = await fetchFavoriteIds(IDENTITY)
    expect(ids).toEqual(['0xa-1', '0xb-2'])
    expect(signedFetch).toHaveBeenCalledTimes(1)
    expect(signedFetch).toHaveBeenCalledWith(
      `https://marketplace.example/v1/lists/${DEFAULT_LIST_ID}/picks?limit=100&offset=0`,
      { method: 'GET', identity: IDENTITY, metadata: {} }
    )
  })

  it('should page through until every pick is fetched', async () => {
    const page = (start: number, count: number, total: number) =>
      ok({
        ok: true,
        data: {
          results: Array.from({ length: count }, (_, i) => ({ itemId: `0xa-${start + i}`, createdAt: 0 })),
          total
        }
      })
    signedFetch.mockResolvedValueOnce(page(0, 100, 150)).mockResolvedValueOnce(page(100, 50, 150))
    const ids = await fetchFavoriteIds(IDENTITY)
    expect(ids).toHaveLength(150)
    expect(signedFetch).toHaveBeenCalledTimes(2)
    expect(signedFetch.mock.calls[1][0]).toContain('offset=100')
  })

  it('and the response is an HTTP error it should throw', async () => {
    signedFetch.mockResolvedValueOnce(fail(500))
    await expect(fetchFavoriteIds(IDENTITY)).rejects.toThrow('fetchFavoriteIds 500')
  })

  it('and the envelope reports ok: false it should throw', async () => {
    signedFetch.mockResolvedValueOnce(ok({ ok: false, message: 'nope', data: {} }))
    await expect(fetchFavoriteIds(IDENTITY)).rejects.toThrow('nope')
  })

  it('and the envelope reports ok: false without a message it should still throw', async () => {
    signedFetch.mockResolvedValueOnce(ok({ ok: false, data: {} }))
    await expect(fetchFavoriteIds(IDENTITY)).rejects.toThrow('not ok')
  })
})

describe('when picking or unpicking a favorite', () => {
  it('should POST the pick into the default list', async () => {
    signedFetch.mockResolvedValueOnce(ok({ ok: true, data: { pickedByUser: true } }))
    await setFavorite('0xa-1', true, IDENTITY)
    expect(signedFetch).toHaveBeenCalledWith('https://marketplace.example/v1/picks/0xa-1', {
      method: 'POST',
      identity: IDENTITY,
      metadata: {},
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickedFor: [DEFAULT_LIST_ID] })
    })
  })

  it('should POST the unpick out of the default list', async () => {
    signedFetch.mockResolvedValueOnce(ok({ ok: true, data: { pickedByUser: false } }))
    await setFavorite('0xa-1', false, IDENTITY)
    const [, opts] = signedFetch.mock.calls[0]
    expect(opts.body).toBe(JSON.stringify({ unpickedFrom: [DEFAULT_LIST_ID] }))
  })

  it('and the response is an HTTP error it should throw', async () => {
    signedFetch.mockResolvedValueOnce(fail(401))
    await expect(setFavorite('0xa-1', true, IDENTITY)).rejects.toThrow('setFavorite 401')
  })

  it('and the envelope reports ok: false it should throw', async () => {
    signedFetch.mockResolvedValueOnce(ok({ ok: false, message: 'Invalid signer', data: {} }))
    await expect(setFavorite('0xa-1', true, IDENTITY)).rejects.toThrow('Invalid signer')
  })

  it('and the envelope reports ok: false without a message it should still throw', async () => {
    signedFetch.mockResolvedValueOnce(ok({ ok: false, data: {} }))
    await expect(setFavorite('0xa-1', true, IDENTITY)).rejects.toThrow('not ok')
  })

  it('and the success body is not JSON it should resolve anyway', async () => {
    signedFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('no body')
      },
      text: async () => ''
    })
    await expect(setFavorite('0xa-1', true, IDENTITY)).resolves.toBeUndefined()
  })
})

describe('when fetching how many people saved an item', () => {
  function statsOk(rows: { itemId: string; count: number; pickedByUser?: boolean }[]) {
    return { ok: true, status: 200, json: async () => ({ ok: true, data: rows }) }
  }

  it('should read the stats of everything asked for in the same window in ONE request', async () => {
    const plainFetch = vi.fn().mockResolvedValue(
      statsOk([
        { itemId: '0xa-1', count: 12 },
        { itemId: '0xb-2', count: 3 }
      ])
    )
    vi.stubGlobal('fetch', plainFetch)

    const [first, second] = await Promise.all([fetchFavoriteStats('0xa-1'), fetchFavoriteStats('0xb-2')])

    expect(first).toEqual({ count: 12, pickedByUser: false })
    expect(second).toEqual({ count: 3, pickedByUser: false })
    expect(plainFetch).toHaveBeenCalledTimes(1)
    const url = new URL(plainFetch.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/v1/picks/stats')
    expect(url.searchParams.getAll('itemId')).toEqual(['0xa-1', '0xb-2'])
    expect(url.searchParams.get('checkingUserAddress')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('and an account is given it should ask whether that account is one of them', async () => {
    const plainFetch = vi.fn().mockResolvedValue(statsOk([{ itemId: '0xa-1', count: 12, pickedByUser: true }]))
    vi.stubGlobal('fetch', plainFetch)

    await expect(fetchFavoriteStats('0xa-1', '0xAbC')).resolves.toEqual({ count: 12, pickedByUser: true })
    const url = new URL(plainFetch.mock.calls[0][0] as string)
    expect(url.searchParams.get('checkingUserAddress')).toBe('0xabc')
    vi.unstubAllGlobals()
  })

  it('and two accounts ask at once it should keep their reads apart', async () => {
    const plainFetch = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(statsOk([{ itemId: '0xa-1', count: 12, pickedByUser: url.includes('0xabc') }]))
      )
    vi.stubGlobal('fetch', plainFetch)

    const [signedOut, signedIn] = await Promise.all([fetchFavoriteStats('0xa-1'), fetchFavoriteStats('0xa-1', '0xabc')])

    expect(signedOut.pickedByUser).toBe(false)
    expect(signedIn.pickedByUser).toBe(true)
    expect(plainFetch).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it('and more keys are asked for than fit in one read it should split them', async () => {
    const plainFetch = vi.fn().mockResolvedValue(statsOk([]))
    vi.stubGlobal('fetch', plainFetch)

    const keys = Array.from({ length: 51 }, (_, i) => `0xa-${i}`)
    const stats = await Promise.all(keys.map(key => fetchFavoriteStats(key)))

    expect(plainFetch).toHaveBeenCalledTimes(2)
    // Nothing came back for them, which is zero saves — not a promise left hanging.
    expect(stats.every(s => s.count === 0)).toBe(true)
    vi.unstubAllGlobals()
  })

  it('and the response is an HTTP error it should throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))
    await expect(fetchFavoriteStats('0xa-1')).rejects.toThrow('fetchFavoriteStats 500')
    vi.unstubAllGlobals()
  })

  it('and the envelope reports ok: false it should throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: false, message: 'Invalid item id' }) })
    )
    await expect(fetchFavoriteStats('0xa-1')).rejects.toThrow('Invalid item id')
    vi.unstubAllGlobals()
  })
})
