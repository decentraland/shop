import { describe, it, expect, beforeEach } from 'vitest'
import { hrefFor, itemRoute, tokenRoute, detailRouteFor, canManageToken, myItemsRouteFor, routeSegment } from './routes'

describe('hrefFor', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/' },
      writable: true
    })
  })

  it('returns the path as-is when not under /shop', () => {
    window.location.pathname = '/'
    expect(hrefFor('/items')).toBe('/items')
  })

  it('prepends /shop when pathname is exactly /shop', () => {
    window.location.pathname = '/shop'
    expect(hrefFor('/items')).toBe('/shop/items')
  })

  it('prepends /shop when pathname starts with /shop/', () => {
    window.location.pathname = '/shop/collectibles'
    expect(hrefFor('/items')).toBe('/shop/items')
  })

  it('throws on paths that do not start with /', () => {
    expect(() => hrefFor('items')).toThrow()
  })

  it('throws on protocol-relative paths (//)', () => {
    expect(() => hrefFor('//evil.com')).toThrow()
  })
})

describe('detailRouteFor', () => {
  it('routes a row with a tokenId to the specific /token page', () => {
    // Even when an itemId is also present, a concrete token wins (it identifies one copy).
    expect(detailRouteFor({ contractAddress: '0xabc', tokenId: '999', itemId: '5' })).toBe('/token/0xabc/999')
  })

  it('routes a catalog/primary row (itemId only) to the generic /item page', () => {
    expect(detailRouteFor({ contractAddress: '0xabc', itemId: '5' })).toBe('/item/0xabc/5')
  })

  it('returns null when there is no contract or id to route to', () => {
    expect(detailRouteFor({ contractAddress: '', itemId: '5' })).toBeNull()
    expect(detailRouteFor({ contractAddress: '0xabc' })).toBeNull()
  })

  it('never emits an /item URL for a token (regression guard for the wrong-item bug)', () => {
    const path = detailRouteFor({ contractAddress: '0xabc', tokenId: '123456789' })
    expect(path?.startsWith('/token/')).toBe(true)
    expect(path?.startsWith('/item/')).toBe(false)
  })
})

describe('itemRoute / tokenRoute', () => {
  it('builds the expected paths', () => {
    expect(itemRoute('0xabc', '5')).toBe('/item/0xabc/5')
    expect(tokenRoute('0xabc', '999')).toBe('/token/0xabc/999')
  })
})

describe('canManageToken', () => {
  it('allows manage only on a token route for a token the viewer owns', () => {
    expect(canManageToken({ isTokenRoute: true, ownsThisToken: true })).toBe(true)
  })

  it('never allows manage on the item route, even when the viewer owns copies', () => {
    expect(canManageToken({ isTokenRoute: false, ownsThisToken: true })).toBe(false)
  })

  it('never allows manage for a token the viewer does not own', () => {
    expect(canManageToken({ isTokenRoute: true, ownsThisToken: false })).toBe(false)
  })
})

/**
 * The post-purchase CTA promises the buyer their item is in My Items, so it has to land on the shelf it is
 * actually on: bare `/my-items` opens on Wearables, which is not where an emote went.
 */
describe('myItemsRouteFor', () => {
  it('sends a wearable purchase to the Wearables shelf', () => {
    expect(myItemsRouteFor(['wearable'])).toBe('/my-items?section=wearables')
  })

  it('sends an emote purchase to the Emotes shelf', () => {
    expect(myItemsRouteFor(['emote'])).toBe('/my-items?section=emotes')
  })

  it('sends a NAME to the Names shelf', () => {
    expect(myItemsRouteFor(['ens'])).toBe('/my-items?section=names')
  })

  it('keeps one shelf for a basket of the same kind, however many lines', () => {
    expect(myItemsRouteFor(['emote', 'emote', 'emote'])).toBe('/my-items?section=emotes')
  })

  it('falls back to the default shelf for a mixed basket, which has no single home', () => {
    expect(myItemsRouteFor(['wearable', 'emote'])).toBe('/my-items')
  })

  it('falls back to the default shelf for a missing or unknown category', () => {
    expect(myItemsRouteFor([undefined])).toBe('/my-items')
    expect(myItemsRouteFor([null])).toBe('/my-items')
    expect(myItemsRouteFor(['land'])).toBe('/my-items')
    expect(myItemsRouteFor([])).toBe('/my-items')
  })
})

/**
 * The in-world client appends `&utm_source=client` to a URL with no query string, so the `&` lands inside
 * the path and the itemId arrives as `0&utm_source=client`. Every lookup keyed on it missed and the page
 * called a buyable mint "Not for sale" — on production, with the suffix, an item selling at 15 MANA with
 * 942 of 1,000 left offered BUY RESALE instead of Buy Now.
 */
describe('routeSegment', () => {
  it('should drop a query fragment that leaked into the path', () => {
    expect(routeSegment('0&utm_source=client')).toBe('0')
    expect(routeSegment('12?utm_source=client')).toBe('12')
    expect(routeSegment('7#section')).toBe('7')
  })

  it('should leave a clean segment exactly as it is, including a long token id', () => {
    expect(routeSegment('0')).toBe('0')
    expect(routeSegment('0xc2f737293a3b6da7c75ececc095265e76dc3f799')).toBe(
      '0xc2f737293a3b6da7c75ececc095265e76dc3f799'
    )
    const tokenId = '105312291668557186697918027683670432318895095400549111254310977536'
    expect(routeSegment(tokenId)).toBe(tokenId)
  })

  it('should report nothing for an absent or empty segment, so callers keep their own fallbacks', () => {
    expect(routeSegment(undefined)).toBeUndefined()
    expect(routeSegment('')).toBeUndefined()
    // A segment that is ONLY the stray fragment leaves nothing to look up — better undefined than ''.
    expect(routeSegment('&utm_source=client')).toBeUndefined()
  })
})
