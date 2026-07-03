import type { ChainId, Network } from '@dcl/schemas'
import type { PreparedTrade } from './prepare'

// A classic (ERC20 / MANA-priced) open listing we want to migrate. Normalized shape produced by
// enumerate.ts regardless of whether it came from the /v1/orders API or a DB read.
export type ClassicListing = {
  // Stable identity of what's being sold.
  listingType: 'secondary' | 'primary'
  contractAddress: string
  // Exactly one of these is set: tokenId (secondary ERC721) or itemId (primary COLLECTION_ITEM).
  tokenId?: string
  itemId?: string
  seller: string // the trade signer — the ONLY wallet that can re-sign (see MIGRATION_SPEC §4).
  manaWei: string // classic price, MANA with 18 decimals.
  expiresAtMs: number // classic listing expiration in ms.
  network: Network
  chainId: ChainId
  oldTradeId?: string // the classic trade to cancel (present for API-sourced secondary orders).
  // Primary only: how many units the classic listing could still mint (remaining supply).
  remainingSupply?: number
}

// The outcome of classifying + preparing one candidate.
export type MigrationStatus =
  | 'PREPARED' // unsigned USD-pegged payload built, ready to sign
  | 'SIGNED'
  | 'POSTED'
  | 'OLD_CANCELLED'
  | 'SKIP_ALREADY_USD'
  | 'SKIP_EXPIRED'
  | 'SKIP_STALE_OWNER'
  | 'SKIP_UNSUPPORTED'
  | 'NEEDS_MINTER' // primary: collection not yet Shop-enabled (setMinters)
  | 'NEEDS_APPROVAL' // secondary: marketplace not approved as operator
  | 'ERROR'

// One row of the run: the source listing + the computed USD price + the prepared payload.
export type MigrationEntry = {
  key: string // idempotency key (MIGRATION_SPEC §8), stable per (item, seller, chain).
  source: ClassicListing
  status: MigrationStatus
  // Conversion result (present once priced).
  usdWei?: string
  usdDisplay?: string // "$27.00"
  credits?: number
  // The exact unsigned trade + EIP-712 material for the injected signer.
  prepared?: PreparedTrade
  // Populated as the run advances / on error.
  newTradeId?: string
  cancelledOldTx?: string
  note?: string
}

export type OracleSnapshot = {
  aggregatorAddress: string
  decimals: number
  rate: string // MANA price in USD, scaled 1e{decimals}, as read from latestRoundData()[1].
  readAtMs: number
}
