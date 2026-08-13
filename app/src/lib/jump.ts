import { config } from '~/config'

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
