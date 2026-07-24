// Whether the PDP's sale section (price + CTAs) is still LOADING and must show a skeleton instead of a
// data-dependent branch. The anti-pattern this guards against: rendering "not for sale / notify / make
// an offer" (or a wrong default) while the sale/ownership/price queries are still in flight — that
// fallback is only a valid CONCLUSION once the data has settled. So we treat the section as resolved
// when EITHER we already have a positive signal (buyable / the viewer manages it / sold-out-with-resale
// / a market item resolved synchronously from router state) OR every relevant query has settled (a
// genuine "not for sale" is then a real answer). Otherwise it's still loading.
export type SaleSectionFlags = {
  /** Legacy/MANA item — its price + CTA come synchronously from router state, so it never waits. */
  isMarket: boolean
  /** A buyable listing has resolved. */
  forSale: boolean
  /** The viewer manages this (creator's primary listing, or an owned token on the /token page). */
  manage: boolean
  /** Sold-out primary that still has resellers (the buy-the-cheapest-resale state). */
  soldOutWithResale: boolean
  /** The page-level identity is still hydrating (no name yet, siblings pending, etc.). */
  stillResolving: boolean
  /** The buyable-trade query is still loading. */
  resolvingTrade: boolean
  /** /token route → the CTA depends on the owned-token query. */
  isTokenRoute: boolean
  /** owned-token query loading (only meaningful on the /token route). */
  ownedAssetLoading: boolean
  /** shop-listing (stock/price) query loading (only meaningful on the /item route). */
  deepLinkLoading: boolean
}

export function isSaleSectionLoading(f: SaleSectionFlags): boolean {
  const resolved =
    f.isMarket ||
    f.forSale ||
    f.manage ||
    f.soldOutWithResale ||
    (!f.stillResolving && !f.resolvingTrade && (f.isTokenRoute ? !f.ownedAssetLoading : !f.deepLinkLoading))
  return !resolved
}
