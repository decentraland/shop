import type { Trade } from '@dcl/schemas'
import type { CatalogItem } from '~/lib/api'
import { isPrimaryItem } from '~/lib/analytics'

// You can't buy your own listing — pointless for a resale (you already own the token) and, for a
// primary, it's just minting to yourself. We block it in two layers:

// UI layer (best-effort, for disabling the button early): a PRIMARY (mint) listing whose creator is
// the connected user. We can only judge primaries from the catalog — a secondary's real seller is the
// trade signer, which the catalog doesn't carry (and `creator` there is the original creator, NOT the
// reseller, so we must NOT block a creator from buying a resale of their own creation).
export function isOwnListing(
  item: Pick<CatalogItem, 'creator' | 'itemId' | 'tokenId'>,
  address?: string | null
): boolean {
  if (!address || !item.creator) return false
  return isPrimaryItem(item) && item.creator.toLowerCase() === address.toLowerCase()
}

// Authoritative layer (checked right before money moves): the trade's seller (signer) is the buyer.
// Correct for BOTH primary and secondary. This is the real guard; isOwnListing is just early UX.
export function isOwnTrade(trade: Pick<Trade, 'signer'>, buyer: string): boolean {
  return !!trade.signer && !!buyer && trade.signer.toLowerCase() === buyer.toLowerCase()
}
