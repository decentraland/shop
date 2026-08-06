import { describe, it, expect, beforeEach } from 'vitest'
import { hrefFor, itemRoute, tokenRoute, detailRouteFor, canManageToken, myItemsRouteFor } from './routes'

describe('hrefFor', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/' },
      writable: true,
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
