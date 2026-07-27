import { describe, it, expect } from 'vitest'
import { isSaleSectionLoading, type SaleSectionFlags } from '~/lib/pdp-loading'

// Baseline: nothing concluded yet and every query still in flight → must be LOADING (show skeleton),
// never the notify / make-offer fallback.
const loading: SaleSectionFlags = {
  isMarket: false,
  forSale: false,
  manage: false,
  soldOutWithResale: false,
  stillResolving: false,
  resolvingTrade: true,
  isTokenRoute: false,
  ownedAssetLoading: false,
  deepLinkLoading: true
}

describe('isSaleSectionLoading', () => {
  it('is loading while the trade / shop-listing queries are still in flight and nothing has concluded', () => {
    expect(isSaleSectionLoading(loading)).toBe(true)
  })

  it('does NOT show the fallback while the owned-token query is loading on a /token page', () => {
    expect(
      isSaleSectionLoading({
        ...loading,
        isTokenRoute: true,
        resolvingTrade: false,
        deepLinkLoading: false,
        ownedAssetLoading: true
      })
    ).toBe(true)
  })

  it('resolves immediately once we know it is buyable (forSale), even mid-fetch', () => {
    expect(isSaleSectionLoading({ ...loading, forSale: true })).toBe(false)
  })

  it('resolves immediately once we know the viewer manages it', () => {
    expect(isSaleSectionLoading({ ...loading, manage: true })).toBe(false)
  })

  it('resolves immediately for a sold-out-with-resale item', () => {
    expect(isSaleSectionLoading({ ...loading, soldOutWithResale: true })).toBe(false)
  })

  it('resolves synchronously for a market item (no async wait)', () => {
    expect(isSaleSectionLoading({ ...loading, isMarket: true })).toBe(false)
  })

  it('resolves to a genuine "not for sale" once all /item queries have settled with no positive signal', () => {
    expect(
      isSaleSectionLoading({ ...loading, resolvingTrade: false, deepLinkLoading: false, stillResolving: false })
    ).toBe(false)
  })

  it('resolves to a genuine "not for sale" once the /token owned-token query has settled', () => {
    expect(
      isSaleSectionLoading({
        ...loading,
        isTokenRoute: true,
        resolvingTrade: false,
        deepLinkLoading: false,
        ownedAssetLoading: false
      })
    ).toBe(false)
  })

  it('stays loading while the page identity is still hydrating (stillResolving)', () => {
    expect(
      isSaleSectionLoading({ ...loading, resolvingTrade: false, deepLinkLoading: false, stillResolving: true })
    ).toBe(true)
  })
})
