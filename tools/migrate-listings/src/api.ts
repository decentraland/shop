import type { TradeCreation } from '@dcl/schemas'
import { config } from './config'

// POST a signed USD-pegged TradeCreation to marketplace-server. The endpoint requires DCL auth-chain
// signed headers (intent dcl:create-trade). The Shop app does this via decentraland-dapps'
// TradeService (shop/app/src/lib/api.ts:postTrade). This tool leaves header construction to the
// caller so it stays dependency-light: pass the headers you'd attach for the connected seller.

export type PostTradeResult = { ok: true; tradeId: string } | { ok: false; status: number; message: string }

export async function postTrade(trade: TradeCreation, authHeaders: Record<string, string>): Promise<PostTradeResult> {
  const res = await fetch(`${config.marketplaceServerUrl}/v1/trades`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(trade),
  })
  const json = (await res.json().catch(() => ({}))) as { data?: { id?: string }; message?: string }
  if (!res.ok) {
    // Server dedupe (DuplicateNFTOrderError / DuplicateItemOrderError) means it's effectively already
    // listed — the caller treats this as SKIP_ALREADY_USD, not a hard failure. See MIGRATION_SPEC §8.
    return { ok: false, status: res.status, message: json.message ?? `POST /v1/trades ${res.status}` }
  }
  return { ok: true, tradeId: json.data?.id ?? '' }
}
