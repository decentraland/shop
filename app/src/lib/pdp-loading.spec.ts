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
  deepLinkLoading: true,
  priceKnown: false
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

  // CHANGED: "buyable" used to be enough on its own. It isn't — a shop-listed token can resolve as
  // buyable while its price is still 0 (see the price block below), and concluding here is what put
  // "PRICE 0" next to an enabled Buy now. Buyable AND priced is the condition.
  it('resolves mid-fetch once we know it is buyable AND priced', () => {
    expect(isSaleSectionLoading({ ...loading, forSale: true, priceKnown: true })).toBe(false)
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

describe('a listing whose price is not known yet', () => {
  // The bug this pins: a token listed in the SHOP hydrates its money fields from the legacy MANA order,
  // which a USD-pegged shop trade never appears in — so the trade resolves as buyable while the price is
  // still 0. Concluding on `forSale` alone rendered "PRICE 0" next to an enabled Buy now on a token
  // actually listed for 11 credits. A price of zero is not a price; it is a missing one.
  it('keeps the section loading when it is for sale but the price has not arrived', () => {
    expect(isSaleSectionLoading({ ...loading, forSale: true, priceKnown: false })).toBe(true)
  })

  it('resolves once the price lands', () => {
    expect(isSaleSectionLoading({ ...loading, forSale: true, priceKnown: true })).toBe(false)
  })

  it('still resolves for the viewer who MANAGES it, whose price comes from their own listing', () => {
    expect(isSaleSectionLoading({ ...loading, manage: true, priceKnown: false })).toBe(false)
  })

  it('still resolves for a legacy market item, which never waits on the shop feed', () => {
    expect(isSaleSectionLoading({ ...loading, isMarket: true, priceKnown: false })).toBe(false)
  })

  it('still resolves for a sold-out primary with resellers', () => {
    expect(isSaleSectionLoading({ ...loading, soldOutWithResale: true, priceKnown: false })).toBe(false)
  })
})
