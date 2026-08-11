import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'http://marketplace.test' } }))

import { fetchShopTopCreators } from '~/lib/rankings'

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: status === 200, status, json: async () => body })
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

describe('when fetching the shop creator ranking', () => {
  // The endpoint, spelled out. `/v1/rankings/creators` also answers this shape of question and returns a
  // plausible-looking row — it just credits the seller rather than the creator, so a wrong path here would
  // silently produce a different, worse ranking rather than an error.
  it('should ask the marketplace server v3 catalog for a window of creators', async () => {
    const fetchMock = mockFetch(200, { data: [] })

    await fetchShopTopCreators(30, 30)

    expect(fetchMock).toHaveBeenCalledWith('http://marketplace.test/v3/catalog/creators?first=30&days=30')
  })

  it('should unwrap the ranked rows', async () => {
    mockFetch(200, { data: [{ id: '0xa', sales: 62 }] })

    expect(await fetchShopTopCreators(30, 30)).toEqual([{ id: '0xa', sales: 62 }])
  })

  it('should treat a body with no data as an empty ranking', async () => {
    mockFetch(200, {})

    expect(await fetchShopTopCreators(30, 30)).toEqual([])
  })

  // Thrown rather than swallowed: an empty ranking hides the row, and a failing endpoint must not look
  // like a month in which nobody sold anything.
  it('should throw when the endpoint fails', async () => {
    mockFetch(503, {})

    await expect(fetchShopTopCreators(30, 30)).rejects.toThrow('fetchShopTopCreators 503')
  })
})
