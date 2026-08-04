import type { QueryClient } from '@tanstack/react-query'

/**
 * The listings this session has taken down — so no screen offers one back.
 *
 * Cancelling is immediate for the seller (the signature is invalidated on-chain the moment the action
 * confirms), but every READ goes through the shop feed's eventually-consistent materialized view, which
 * lags a moment behind. For those few seconds the feed — and every cache, grid row and router state seeded
 * from it — still hands the SAME, now-dead trade back. So a screen that re-reads right after the cancel
 * concludes the item is still for sale at the old price, which is exactly what left the item page unchanged
 * after "Remove from sale": nothing was invalidated wrongly, the authoritative answer was simply still stale.
 *
 * A cancelled trade can never come back — re-listing signs a NEW trade with a new id — so remembering the
 * ids we retired is enough to ignore precisely the stale answer and nothing else. No polling, no timers, and
 * no blanket suppression: another seller's listing, or a re-list, is a different id and passes straight
 * through. Kept in the query cache rather than a module global so it shares react-query's lifetime (one app
 * session, garbage-collected once nothing reads it) and so tests get a clean slate with a fresh QueryClient.
 */
const KEY = ['cancelled-listings']

/** Retire a trade id: every subsequent liveTradeId() call reports it as gone. */
export function markListingCancelled(qc: QueryClient, tradeId: string): void {
  if (!tradeId) return
  qc.setQueryData<string[]>(KEY, prev => (prev?.includes(tradeId) ? prev : [...(prev ?? []), tradeId]))
}

/**
 * The trade id, or undefined when it names a listing this session already took down. Wrap every read of a
 * trade id that decides whether something is buyable, whatever its source (item state, a query, router
 * state) — the stale id can arrive from any of them.
 */
export function liveTradeId(qc: QueryClient, tradeId?: string | null): string | undefined {
  if (!tradeId) return undefined
  return qc.getQueryData<string[]>(KEY)?.includes(tradeId) ? undefined : tradeId
}
