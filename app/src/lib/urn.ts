import { ChainId, ChainName } from '@dcl/schemas'
import { config } from '~/config'
import type { CatalogItem } from '~/lib/api'

// Wearable item URN so a preview can EQUIP the item on an avatar (try-on), rather than just render the
// item in isolation. Collections-v2 (matic/amoy) — the only kind the Shop lists. Returns null when
// there's no itemId (e.g. a secondary listing keyed by tokenId, which can't be equipped by item URN).
//
// The network comes from the ITEM's own chain, not the app's: a dev build pointed at the mainnet
// catalog (the outfit-seeds setup) must still mint matic URNs, or the preview resolves nothing.
export function itemUrn(
  item: Pick<CatalogItem, 'contractAddress' | 'itemId' | 'chainId'>
): `urn:decentraland:${string}` | null {
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

/**
 * WHICH NETWORK A LIST OF URNS BELONGS TO, and therefore which catalyst holds their content.
 *
 * An item URN names its own network, and it is not always the app's: a dev build reading the mainnet
 * catalog (the outfit-seeds setup) lists matic items, and those live on the .org catalyst only — ask .zone
 * for them and every one comes back missing. Off-chain URNs (base avatars, bodies) name no network and are
 * served by both, so they never decide; the first item URN does, and the app's own chain is the fallback
 * for a list that holds nothing but base wearables.
 */
export function urnNetwork(urns: string[]): ChainName.MATIC_AMOY | ChainName.MATIC_MAINNET {
  for (const urn of urns) {
    if (urn.includes(':amoy:')) return ChainName.MATIC_AMOY
    if (urn.includes(':matic:')) return ChainName.MATIC_MAINNET
  }
  const chainId: ChainId = config.chainId
  return chainId === ChainId.MATIC_AMOY ? ChainName.MATIC_AMOY : ChainName.MATIC_MAINNET
}

const PEER_URL_BY_NETWORK = {
  [ChainName.MATIC_AMOY]: 'https://peer.decentraland.zone',
  [ChainName.MATIC_MAINNET]: 'https://peer.decentraland.org'
} as const

/** The catalyst that holds the content for these urns — see `urnNetwork` for why it isn't `config.peerUrl`. */
export function peerUrlFor(urns: string[]): string {
  return PEER_URL_BY_NETWORK[urnNetwork(urns)]
}
