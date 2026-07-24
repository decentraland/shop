import { describe, it, expect } from 'vitest'
import { itemRoute, tokenRoute, detailRouteFor, canManageToken } from '~/lib/routes'

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
