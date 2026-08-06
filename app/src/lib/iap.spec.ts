import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isIapMode, resetIapModeCache } from '~/lib/iap'

/**
 * The iOS web-view flag.
 *
 * Two properties matter, and only one of them is about reading the param. The other is that the answer
 * STICKS: the param arrives on the URL the web view loads and the Shop's own navigations drop it, so a
 * per-render read would put the credit-selling surfaces back the moment the buyer opened an item.
 */
const realLocation = window.location

function setSearch(search: string): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, search }
  })
}

beforeEach(() => {
  resetIapModeCache()
})

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
  resetIapModeCache()
})

describe('when the app is loaded in the iOS web view', () => {
  it('should report iap mode for the marketplace’s own param and value', () => {
    setSearch('?view=mobile-iap')

    expect(isIapMode()).toBe(true)
  })

  it('should report iap mode alongside other params', () => {
    setSearch('?foo=1&view=mobile-iap&bar=2')

    expect(isIapMode()).toBe(true)
  })

  // The point of memoising: the Shop's navigations do not carry the param forward, and losing it would
  // silently re-enable the credit-selling surfaces mid-session.
  it('should stay on after the param is gone from the url', () => {
    setSearch('?view=mobile-iap')
    expect(isIapMode()).toBe(true)

    setSearch('')

    expect(isIapMode()).toBe(true)
  })
})

describe('when the app is loaded normally', () => {
  it.each([
    ['no search at all', ''],
    ['an unrelated param', '?q=hat'],
    ['another view', '?view=migrate'],
    ['a near miss on the value', '?view=mobile-iap-x'],
    ['the value under a different key', '?mode=mobile-iap']
  ])('should not report iap mode with %s', (_label, search) => {
    setSearch(search)

    expect(isIapMode()).toBe(false)
  })

  // Symmetry with the sticky-on case: a normal load must not become an iap session later either.
  it('should stay off even if the param appears afterwards', () => {
    setSearch('')
    expect(isIapMode()).toBe(false)

    setSearch('?view=mobile-iap')

    expect(isIapMode()).toBe(false)
  })
})

describe('when there is no location to read', () => {
  it('should not report iap mode instead of throwing', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      get() {
        throw new Error('no location')
      }
    })

    expect(() => isIapMode()).not.toThrow()
    expect(isIapMode()).toBe(false)
  })
})
