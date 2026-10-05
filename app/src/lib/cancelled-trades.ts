import signedFetch from 'decentraland-crypto-fetch'
import { TradeAssetType } from '@dcl/schemas'
import type { AuthIdentity } from '@dcl/crypto'
import { config } from '~/config'
import { usdWeiToCents } from '~/lib/api'
import { usdCentsToCredits } from '~/lib/currency'
import { manaWeiToCredits, type ManaRate } from '~/lib/mana-convert'

/** Why a trade was cancelled server-side. Only the signature-index bump is surfaced today. */
export const SIGNATURE_INDEX_BUMP_REASON = 'contract_signature_index_bump'

export type CancelledTradeType = 'bid' | 'public_nft_order' | 'public_item_order'

// Server shape (GET /v1/cancelled-trades).
export type CancelledTrade = {
  id: string
  type: CancelledTradeType
  network: string
  chainId: number
  contract: string
  reason: string
  createdAt: number
  expiresAt: number
  cancelledAt: number
  asset: {
    contractAddress: string
    tokenId: string | null
    itemId: string | null
    name: string | null
    image: string | null
  }
  price: { assetType: number; amount: string } | null
}

const PAGE_SIZE = 100

/** The signed-in account's re-creatable listings and offers taken down by the signature-index bump. */
export async function fetchCancelledTrades(identity: AuthIdentity): Promise<CancelledTrade[]> {
  const qs = new URLSearchParams({ reason: SIGNATURE_INDEX_BUMP_REASON, first: String(PAGE_SIZE) })
  const res = await signedFetch(`${config.marketplaceServerUrl}/v1/cancelled-trades?${qs.toString()}`, {
    method: 'GET',
    identity,
    metadata: { signer: 'dcl:marketplace' }
  })
  if (!res.ok) {
    void res.body?.cancel()
    throw new Error(`fetchCancelledTrades ${res.status}`)
  }
  const { data } = (await res.json()) as { data?: CancelledTrade[] }
  return data ?? []
}

/** The old price in credits, or null when it cannot be shown (no price, unknown asset, rate not loaded). */
export function cancelledTradeCredits(trade: Pick<CancelledTrade, 'price'>, rate: ManaRate | undefined): number | null {
  const { price } = trade
  if (!price) return null
  if (price.assetType === Number(TradeAssetType.USD_PEGGED_MANA)) {
    const cents = usdWeiToCents(price.amount)
    return cents > 0 ? usdCentsToCredits(cents) : null
  }
  if (price.assetType === Number(TradeAssetType.ERC20)) return rate ? manaWeiToCredits(price.amount, rate) : null
  return null
}

/** Which mix of listings and offers a set of cancelled trades is, for picking the banner's wording. */
export function cancelledTradesKind(trades: Pick<CancelledTrade, 'type'>[]): 'listings' | 'offers' | 'mixed' {
  const bids = trades.filter(trade => trade.type === 'bid').length
  if (bids === 0) return 'listings'
  return bids === trades.length ? 'offers' : 'mixed'
}
