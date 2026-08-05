// Detail-page route builders. The detail page is reached via TWO routes so the id is never ambiguous:
//   /item/:contractAddress/:itemId    → the generic item page (primary/buy view)
//   /token/:contractAddress/:tokenId  → a specific token page (a single owned/listed copy)
// Every internal link that opens a detail page MUST go through detailRouteFor so a token never lands on
// the item route (which would re-introduce the itemId/tokenId confusion bug).

/** The generic item page. `itemId` is a collection item id (NOT a tokenId). */
export function itemRoute(contractAddress: string, itemId: string): string {
  return `/item/${contractAddress}/${itemId}`
}

/** A specific token page. `tokenId` is a full ERC721 tokenId. */
export function tokenRoute(contractAddress: string, tokenId: string): string {
  return `/token/${contractAddress}/${tokenId}`
}

/**
 * Pick the correct detail route for a catalog/listing row: a row that identifies a SPECIFIC token
 * (carries a tokenId — e.g. a secondary listing or an owned copy) → the token page; otherwise (a
 * primary/catalog row that only has an itemId) → the item page. Returns null when neither id is present.
 */
export function detailRouteFor(item: {
  contractAddress?: string | null
  tokenId?: string | null
  itemId?: string | null
}): string | null {
  if (!item.contractAddress) return null
  if (item.tokenId) return tokenRoute(item.contractAddress, item.tokenId)
  if (item.itemId) return itemRoute(item.contractAddress, item.itemId)
  return null
}

/**
 * Whether the owner-management actions (Edit price / Remove from sale / Transfer) may show. ONLY on a
 * token page, and ONLY for a token the viewer actually owns — NEVER on the generic item page, even if
 * the viewer owns copies of the item (that surfaces a "you own N" note instead).
 */
export function canManageToken(opts: { isTokenRoute: boolean; ownsThisToken: boolean }): boolean {
  return opts.isTokenRoute && opts.ownsThisToken
}

/**
 * My Items, on the CREATIONS tab. Without the section the page defaults to Wearables, which is the wrong
 * shelf for anything the migration flow sends a seller to look at.
 */
export const MY_CREATIONS = '/my-items?section=creations'
