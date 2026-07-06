import { config } from '~/config'
import type { CatalogItem } from '~/lib/api'

// Wearable item URN so a preview can EQUIP the item on an avatar (try-on), rather than just render the
// item in isolation. Collections-v2 (matic/amoy) — the only kind the Shop lists. Returns null when
// there's no itemId (e.g. a secondary listing keyed by tokenId, which can't be equipped by item URN).
export function itemUrn(item: Pick<CatalogItem, 'contractAddress' | 'itemId'>): string | null {
  if (!item.itemId) return null
  const net = config.chainId === 80002 ? 'amoy' : 'matic'
  return `urn:decentraland:${net}:collections-v2:${item.contractAddress.toLowerCase()}:${item.itemId}`
}
