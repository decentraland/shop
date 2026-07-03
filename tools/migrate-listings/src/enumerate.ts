import { ChainId, ListingStatus, Network } from '@dcl/schemas'
import { config } from './config'
import type { ClassicListing } from './types'

// Enumerate a seller's / collection's OPEN classic (MANA-priced) listings. See MIGRATION_SPEC §2.

type RawOrder = {
  contractAddress: string
  tokenId: string
  owner: string
  price: string // MANA wei
  status: ListingStatus
  expiresAt: number // seconds
  network: Network
  chainId: ChainId
  tradeId?: string
  itemId?: string | null
}

export type EnumerateScope = {
  seller?: string
  collection?: string
}

/**
 * Fetch open SECONDARY (ERC721 / public_nft_order) classic orders via the public /v1/orders API.
 * These carry the seller (`owner`), MANA `price`, and the `tradeId` needed to cancel the old
 * listing. Paginates until exhausted.
 */
export async function fetchOpenErc20Orders(scope: EnumerateScope): Promise<ClassicListing[]> {
  if (!scope.seller && !scope.collection) {
    throw new Error('enumerate: pass exactly one of { seller, collection }')
  }
  const out: ClassicListing[] = []
  const first = 100
  let skip = 0

  for (;;) {
    const qs = new URLSearchParams({ status: 'open', first: String(first), skip: String(skip) })
    if (scope.seller) qs.set('owner', scope.seller.toLowerCase())
    if (scope.collection) qs.set('contractAddress', scope.collection.toLowerCase())

    const url = `${config.marketplaceServerUrl}/v1/orders?${qs.toString()}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`GET /v1/orders ${res.status} (${url})`)
    const json = (await res.json()) as { data: RawOrder[]; total: number }
    const rows = json.data ?? []

    for (const o of rows) {
      // Only migrate orders backed by an off-chain trade (tradeId present) — those are the ones we
      // can cancel + re-sign. Anything else is a legacy on-chain order we don't touch here.
      if (!o.tradeId) continue
      out.push({
        listingType: 'secondary',
        contractAddress: o.contractAddress.toLowerCase(),
        tokenId: o.tokenId,
        seller: o.owner.toLowerCase(),
        manaWei: o.price,
        expiresAtMs: o.expiresAt > 1e12 ? o.expiresAt : o.expiresAt * 1000, // orders API returns seconds
        network: o.network,
        chainId: o.chainId,
        oldTradeId: o.tradeId
      })
    }

    if (rows.length < first) break
    skip += first
  }

  return out
}

/**
 * Enumerate open PRIMARY (COLLECTION_ITEM / public_item_order) classic listings.
 *
 * The v1 /orders endpoint does NOT index primary item orders (see shop/app api.ts), so this must
 * read the DAPPS DB directly (schema `marketplace` + `squid_marketplace`) with a scoped, READ-ONLY
 * query — the tool never writes to the DB; re-listing always goes through POST /v1/trades.
 *
 * Left as an explicit, injectable stub so the tool runs end-to-end for the common (secondary) case
 * without a DB dependency. Wire a `pg`/`node-postgres` client here to enable `--source db`. The
 * query to run is `getTradesForTypeQuery(TradeType.PUBLIC_ITEM_ORDER)` from
 * marketplace-server/src/ports/trades/queries.ts, filtered to status='open', signer=<creator> (and/
 * or the collection's contract_address), and received asset_type = 1 (ERC20).
 */
export async function fetchOpenErc20ItemOrders(_scope: EnumerateScope): Promise<ClassicListing[]> {
  const conn = process.env[config.dappsDbConnectionEnvVar]
  if (!conn) {
    // No DB configured → primary enumeration disabled. Secondary migration still works fully.
    return []
  }
  throw new Error(
    'Primary (public_item_order) DB enumeration is a stub. Add a node-postgres client and run ' +
      "getTradesForTypeQuery(TradeType.PUBLIC_ITEM_ORDER) scoped to status='open' + signer/collection " +
      '+ received asset_type = 1. See MIGRATION_SPEC §2.2.'
  )
}
