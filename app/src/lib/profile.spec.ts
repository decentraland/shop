import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { peerUrl: 'http://peer.test' } }))

import { fetchProfile } from '~/lib/profile'

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status === 200,
    status,
    json: async () => body
  })
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

describe('when fetching a profile', () => {
  it('should call the lambdas profile endpoint with a lowercased address', async () => {
    const fetchMock = mockFetch(200, { avatars: [{ name: 'Alice' }] })

    await fetchProfile('0xABC')

    expect(fetchMock).toHaveBeenCalledWith('http://peer.test/lambdas/profiles/0xabc')
  })

  it('should return the first avatar', async () => {
    mockFetch(200, {
      avatars: [{ name: 'Alice', avatar: { snapshots: { face256: 'face.png' } } }, { name: 'Second' }]
    })

    const profile = await fetchProfile('0xabc')

    expect(profile).toEqual({ name: 'Alice', avatar: { snapshots: { face256: 'face.png' } } })
  })

  it('and the response is not ok it should return undefined', async () => {
    mockFetch(404, {})

    expect(await fetchProfile('0xabc')).toBeUndefined()
  })

  it('and there are no avatars it should return undefined', async () => {
    mockFetch(200, { avatars: [] })

    expect(await fetchProfile('0xabc')).toBeUndefined()
  })
})
