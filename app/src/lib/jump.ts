import { launchDesktopApp } from 'decentraland-ui2/dist/modules/jumpIn'
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

/** A spot in world: "x,y" in Genesis City, and a `<name>.dcl.eth` realm for a World. */
export type JumpTarget = { position?: string; realm?: string }

// Only what the explorer can use: a parcel pair, and a World name. "main" or a catalyst name is Genesis
// City, which is already where the explorer lands without one.
function cleanTarget({ position, realm }: JumpTarget): JumpTarget {
  return {
    position: position && /^-?\d+,-?\d+$/.test(position) ? position : undefined,
    realm: realm?.endsWith('.dcl.eth') ? realm : undefined
  }
}

/** The web jump page for a spot, which handles the download and the mobile app itself. */
export function jumpUrl(target: JumpTarget): string {
  const { position, realm } = cleanTarget(target)
  const params = new URLSearchParams()
  if (position) params.set('position', position)
  if (realm) params.set('realm', realm)
  const qs = params.toString()
  return qs ? `${JUMP_URL}?${qs}` : JUMP_URL
}

/**
 * Opens the desktop client at a spot when it is installed, the same way decentraland.org does: fire the
 * `decentraland://` link and watch whether the page loses focus. Otherwise (no client, or a touch device)
 * it falls back to the jump page. Must run inside the click handler, since browsers only allow the
 * protocol hand-off and the new tab from a user gesture. Resolves to where the visitor ended up.
 */
export async function jumpIn(target: JumpTarget): Promise<'client' | 'jump_page'> {
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  if (!touch) {
    const opened = await launchDesktopApp({
      ...cleanTarget(target),
      ...(config.chainId === 80002 ? { dclenv: 'zone' } : {})
    }).catch(() => false)
    if (opened) return 'client'
  }
  // A popup blocker can refuse the tab once the launch attempt has used up the gesture; then go there here.
  if (!window.open(jumpUrl(target), '_blank', 'noopener')) window.location.assign(jumpUrl(target))
  return 'jump_page'
}
