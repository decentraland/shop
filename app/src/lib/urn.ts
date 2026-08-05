import { config } from '~/config'
import type { CatalogItem } from '~/lib/api'

// Wearable item URN so a preview can EQUIP the item on an avatar (try-on), rather than just render the
// item in isolation. Collections-v2 (matic/amoy) — the only kind the Shop lists. Returns null when
// there's no itemId (e.g. a secondary listing keyed by tokenId, which can't be equipped by item URN).
//
// The network comes from the ITEM's own chain, not the app's: a dev build pointed at the mainnet
// catalog (the outfit-seeds setup) must still mint matic URNs, or the preview resolves nothing.
export function itemUrn(item: Pick<CatalogItem, 'contractAddress' | 'itemId' | 'chainId'>): string | null {
  if (!item.itemId) return null
  const chainId = item.chainId ?? config.chainId
  const net = chainId === 80002 ? 'amoy' : 'matic'
  return `urn:decentraland:${net}:collections-v2:${item.contractAddress.toLowerCase()}:${item.itemId}`
}

// Inverse of `itemUrn`: parse a collections-v2 item URN into the marketplace catalog id (`contract-itemId`)
// that `fetchCatalogByIds` expects. Returns null for URNs that aren't collections-v2 items (base avatars,
// off-chain bodies, the OutfitStudio poses used as emotes, etc.).
export function itemIdFromUrn(urn: string): string | null {
  const match = urn.match(/collections-v2:(0x[0-9a-fA-F]{40}):(\d+)$/)
  return match ? `${match[1].toLowerCase()}-${match[2]}` : null
}
