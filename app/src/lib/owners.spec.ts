import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { marketplaceServerUrl: 'http://mps.test' } }))

import { fetchTopOwners, TopOwnersReadError, TopOwnersUnavailableError } from '~/lib/owners'

const CREATOR = '0x1111111111111111111111111111111111111111'

describe('when fetching the top owners of a creator', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('and the server answers', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ address: '0xa' }], total: 7 }), { status: 200 })
      )
    })

    it('should ask for the page and sort, and return the owners and the total', async () => {
      const result = await fetchTopOwners(CREATOR, { sortBy: 'spent', orderDirection: 'asc', first: 5, skip: 10 })

      expect(result).toEqual({ data: [{ address: '0xa' }], total: 7 })
      expect(fetchMock).toHaveBeenCalledWith(
        `http://mps.test/v1/owners/top?creator=${CREATOR}&first=5&skip=10&sortBy=spent&orderDirection=asc`
      )
    })
  })

  describe('and the creator is too large to rank in time', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce(new Response('busy', { status: 503 }))
    })

    it('should throw the unavailable error', async () => {
      await expect(fetchTopOwners(CREATOR, { first: 5, skip: 0 })).rejects.toBeInstanceOf(TopOwnersUnavailableError)
    })
  })

  describe('and the server fails otherwise', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404 }))
    })

    it('should throw a read error carrying the status', async () => {
      await expect(fetchTopOwners(CREATOR, { first: 5, skip: 0 })).rejects.toMatchObject(
        Object.assign(new TopOwnersReadError(404), { status: 404 })
      )
    })
  })
})
