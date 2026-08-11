import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('~/config', () => ({ config: { peerUrl: 'http://peer.test' } }))

import { fetchProfile, fetchProfiles } from '~/lib/profile'

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

describe('when fetching profiles in a batch', () => {
  it('should POST every address lowercased to the batch endpoint', async () => {
    const fetchMock = mockFetch(200, [])

    await fetchProfiles(['0xABC', '0xDef'])

    expect(fetchMock).toHaveBeenCalledWith('http://peer.test/lambdas/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['0xabc', '0xdef'] })
    })
  })

  // The Catalyst echoes `ethAddress` back in its OWN casing, and a caller's address comes from a different
  // system entirely — keying on the raw string would miss every profile it just fetched.
  it('should key the map by lowercased address whatever casing came back', async () => {
    mockFetch(200, [{ avatars: [{ name: 'Alice', ethAddress: '0xABC' }] }])

    const profiles = await fetchProfiles(['0xabc'])

    expect(profiles.get('0xabc')).toEqual({ name: 'Alice', ethAddress: '0xABC' })
  })

  // An address with no profile is simply absent from the response — the map is partial, not holed.
  it('should leave out an address the Catalyst knows nothing about', async () => {
    mockFetch(200, [{ avatars: [{ name: 'Alice', ethAddress: '0xabc' }] }])

    const profiles = await fetchProfiles(['0xabc', '0xdef'])

    expect(profiles.size).toBe(1)
    expect(profiles.has('0xdef')).toBe(false)
  })

  it('should not call the endpoint at all for an empty list', async () => {
    const fetchMock = mockFetch(200, [])

    expect((await fetchProfiles([])).size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should throw when the batch endpoint fails, so a caller does not read an empty map as "nobody qualifies"', async () => {
    mockFetch(500, {})

    await expect(fetchProfiles(['0xabc'])).rejects.toThrow('fetchProfiles 500')
  })
})
