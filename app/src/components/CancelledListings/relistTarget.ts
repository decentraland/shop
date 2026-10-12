import { Network } from '@dcl/schemas'
import { itemRoute, tokenRoute } from '~/lib/routes'
import type { CancelledTrade } from '~/lib/cancelled-trades'
import { marketplaceItemUrl, marketplaceTokenUrl } from '~/components/MarketplaceRedirectModal'

export type RelistTarget = { kind: 'shop'; to: string } | { kind: 'marketplace'; href: string }

/**
 * Where the account can put a cancelled trade back up. Offers and resales the Shop does not take go to
 * the marketplace; listings it does take go to their own page here, which carries the listing flow.
 *
 * The trade carries no category, so a resale is told apart by network: Polygon collections hold only
 * wearables and emotes, which the Shop's token page can list; Ethereum (LAND, Estates, NAMEs, legacy
 * wearables) always goes to the marketplace.
 */
export function relistTargetFor(
  trade: Pick<CancelledTrade, 'type' | 'network' | 'asset'>,
  opts: { secondarySales: boolean }
): RelistTarget | null {
  const { contractAddress, itemId, tokenId } = trade.asset
  if (!contractAddress) return null

  if (trade.type === 'public_item_order') {
    return itemId ? { kind: 'shop', to: itemRoute(contractAddress, itemId) } : null
  }
  if (trade.type === 'public_nft_order') {
    if (!tokenId) return null
    return opts.secondarySales && trade.network === String(Network.MATIC)
      ? { kind: 'shop', to: tokenRoute(contractAddress, tokenId) }
      : { kind: 'marketplace', href: marketplaceTokenUrl(contractAddress, tokenId) }
  }
  if (tokenId) return { kind: 'marketplace', href: marketplaceTokenUrl(contractAddress, tokenId) }
  if (itemId) return { kind: 'marketplace', href: marketplaceItemUrl(contractAddress, itemId) }
  return null
}
