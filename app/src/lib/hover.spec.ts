import { describe, it, expect, afterEach, vi } from 'vitest'
import { canHover } from '~/lib/hover'

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('canHover', () => {
  it('is true when the pointer can hover', () => {
    stubMatchMedia(true)
    expect(canHover()).toBe(true)
  })

  it('is false on a touch pointer', () => {
    stubMatchMedia(false)
    expect(canHover()).toBe(false)
  })

  // Fails towards the feature working: no matchMedia means a browser older than the media feature, not a
  // phone, and withholding hover there would break it for a desktop that simply cannot be asked.
  it('is true when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(canHover()).toBe(true)
  })
})
