import { config } from '~/config'
import type { CatalogItem } from '~/lib/api'

/**
 * Modern in-world entry: the launcher deep-link handled by decentraland.org/jump (zone on testnet).
 * The old play.decentraland.* web client is deprecated, and by the time this is offered the item is
 * already in the buyer's wardrobe.
 *
 * Shared so the two post-purchase surfaces cannot drift: the cart's success page linked it while the
 * PDP's buy modal only closed itself, so the same "Try in World" did different things depending on
 * which door the purchase came through.
 */
export const JUMP_URL = config.chainId === 80002 ? 'https://decentraland.zone/jump' : 'https://decentraland.org/jump'

/**
 * Hands the purchase back to the iOS app: the same deep link the Marketplace already uses for this, so the
 * app opens the backpack on what was just bought rather than on whatever it last showed.
 *
 * This is the link that WORKS inside the web view, and JUMP_URL above is the one that does not — a launcher
 * page cannot run in there. Shared for the same reason JUMP_URL is: the two post-purchase surfaces (the
 * cart's success page and the PDP's buy modal) must not drift into offering different hand-offs.
 *
 * The urn is best-effort — only some catalog feeds return it (see CatalogItem.urn) — and a basket has
 * several items while the link carries one. First one wins: it is the anchor the backpack opens on, and the
 * rest are in there with it. With no urn at all the link still opens the app, just without a landing spot.
 */
export function backpackDeepLink(items: Array<Pick<CatalogItem, 'urn'>>): string {
  const urn = items.find(i => i.urn)?.urn
  return `decentraland://open?iap_enabled=true${urn ? `&urn=${encodeURIComponent(urn)}` : ''}`
}
