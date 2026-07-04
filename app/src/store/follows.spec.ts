import { beforeEach, describe, expect, it, vi } from 'vitest'

// Keep the store's analytics side-effect out of the way.
vi.mock('~/lib/analytics', () => ({ track: vi.fn() }))

const STORAGE_KEY = 'shop:followed-creators:v1'

// The store hydrates from localStorage at import time, so each test resets modules and
// re-imports to get a fresh store bound to the current localStorage contents.
async function freshStore() {
  vi.resetModules()
  const mod = await import('~/store/follows')
  return mod.useFollows
}

describe('follows store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('follows, lowercases, and keeps newest-followed first', async () => {
    const useFollows = await freshStore()
    useFollows.getState().follow('0xAbC')
    useFollows.getState().follow('0xDEF')

    expect(useFollows.getState().followed).toEqual(['0xdef', '0xabc'])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['0xdef', '0xabc'])
  })

  it('is idempotent — following the same creator twice does not duplicate', async () => {
    const useFollows = await freshStore()
    useFollows.getState().follow('0xabc')
    useFollows.getState().follow('0xABC')

    expect(useFollows.getState().followed).toEqual(['0xabc'])
  })

  it('unfollows and toggles', async () => {
    const useFollows = await freshStore()
    const s = () => useFollows.getState()

    s().follow('0xabc')
    expect(s().isFollowing('0xABC')).toBe(true)

    s().toggle('0xabc') // now unfollow
    expect(s().isFollowing('0xabc')).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[]')

    s().toggle('0xabc') // now follow again
    expect(s().isFollowing('0xabc')).toBe(true)
  })

  it('caps the list at 200, keeping the most recent', async () => {
    const useFollows = await freshStore()
    for (let i = 0; i < 205; i++) {
      useFollows.getState().follow('0x' + i.toString(16).padStart(40, '0'))
    }
    const list = useFollows.getState().followed
    expect(list).toHaveLength(200)
    // The last followed is at the front; the earliest ones were dropped.
    expect(list[0]).toBe('0x' + (204).toString(16).padStart(40, '0'))
  })

  it('hydrates from localStorage on init', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['0xseed']))
    const useFollows = await freshStore()
    expect(useFollows.getState().followed).toEqual(['0xseed'])
  })

  it('survives corrupt localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{')
    const useFollows = await freshStore()
    expect(useFollows.getState().followed).toEqual([])
  })
})
