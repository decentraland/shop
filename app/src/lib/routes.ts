// Detail-page route builders. The detail page is reached via TWO routes so the id is never ambiguous:
//   /item/:contractAddress/:itemId    → the generic item page (primary/buy view)
//   /token/:contractAddress/:tokenId  → a specific token page (a single owned/listed copy)
// Every internal link that opens a detail page MUST go through detailRouteFor so a token never lands on
// the item route (which would re-introduce the itemId/tokenId confusion bug).

/**
 * A router path turned into an `href` a plain anchor can use — re-applies the `/shop` basename that
 * main.tsx detects, which router-less links would otherwise drop.
 */
export function hrefFor(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('hrefFor: path must start with a single "/"')
  const { pathname } = window.location
  const base = pathname === '/shop' || pathname.startsWith('/shop/') ? '/shop' : ''
  return `${base}${path}`
}

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

// The My Items section that holds each catalog category. NAMEs are `ens` on the NFT feed.
// Keep in sync with `SECTIONS` in MyAssets.tsx — a new category added here without a matching section
// there (or vice-versa) silently falls back to bare `/my-items`, which is safe but misleading.
const OWNED_SECTIONS: Record<string, string | undefined> = { wearable: 'wearables', emote: 'emotes', ens: 'names' }

/**
 * My Items, on the shelf holding what was just bought. A post-purchase CTA that promises the buyer their
 * item is in My Items has to land on the section it is actually in — bare `/my-items` opens on Wearables,
 * so buying an emote sent them somewhere it could not be. A mixed basket has no single shelf, so it keeps
 * the default one.
 */
export function myItemsRouteFor(categories: Array<string | null | undefined>): string {
  const sections = new Set(categories.map(c => OWNED_SECTIONS[c ?? '']))
  const [only] = [...sections]
  return sections.size === 1 && only ? `/my-items?section=${only}` : '/my-items'
}
