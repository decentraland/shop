import type { PurchaseRecord, CreditOrder } from '~/lib/credits'
import type { SaleRecord } from '~/lib/api'
import { groupPurchases, type PurchaseOrder } from '~/lib/purchases'
import { manaWeiToCredits, type ManaRate } from '~/lib/mana-rate'

export type ActivityFilter = 'all' | 'purchases' | 'sales'

// A completed secondary sale, normalized for the feed. Secondary sales settle on-chain in MANA and the
// seller RECEIVES MANA, so the feed shows the exact `manaWei` amount — NOT credits. (Showing credits
// here was misleading: the seller never got credits for past sales. When proceeds-to-treasury ships,
// sellers will be credited instead, and future sales can switch to a credit amount.) `credits` is the
// legacy indicative conversion, kept for compatibility but no longer displayed.
export type ActivitySale = {
  id: string
  contractAddress: string
  tokenId: string
  itemId: string | null
  counterparty: string // the buyer's account
  credits: number | null
  manaWei: string // exact MANA settlement (wei) the seller received — the displayed amount
  createdAt: number
}

// One entry in the chronological Activity feed. A purchase keeps the existing per-checkout grouping
// (one entry per order, N line items inside); a sale is one entry.
export type ActivityEntry =
  | { kind: 'purchase'; id: string; createdAt: number; order: PurchaseOrder }
  | { kind: 'sale'; id: string; createdAt: number; sale: ActivitySale }
  | { kind: 'credit'; id: string; createdAt: number; order: CreditOrder }

export function toActivitySale(sale: SaleRecord, rate?: ManaRate): ActivitySale {
  return {
    id: sale.id,
    contractAddress: sale.contractAddress,
    tokenId: sale.tokenId,
    itemId: sale.itemId,
    counterparty: sale.buyer,
    credits: rate ? manaWeiToCredits(sale.manaWei, rate) : null,
    manaWei: sale.manaWei,
    createdAt: sale.createdAt
  }
}

// Merge the buyer's credit purchases and their secondary sales into one chronological feed (newest
// first). Purchases reuse the existing grouping (groupPurchases) so the per-checkout order cards are
// unchanged; EXPIRED intents (released, never bought) are dropped, same as the old purchases page.
// Pure + deterministic — no network, no oracle — so it's unit-testable in isolation.
export function buildActivityFeed(input: {
  purchases: PurchaseRecord[]
  sales: SaleRecord[]
  creditOrders?: CreditOrder[]
  rate?: ManaRate
}): ActivityEntry[] {
  const orders = groupPurchases(input.purchases.filter(p => p.status !== 'EXPIRED'))
  const purchaseEntries: ActivityEntry[] = orders.map(order => ({
    kind: 'purchase',
    id: `purchase:${order.id}`,
    createdAt: order.createdAt,
    order
  }))
  const saleEntries: ActivityEntry[] = input.sales.map(s => {
    const sale = toActivitySale(s, input.rate)
    return { kind: 'sale', id: `sale:${sale.id}`, createdAt: sale.createdAt, sale }
  })
  // Credit-pack top-ups. Drop EXPIRED (released, never paid) — mirrors the purchase-intent handling.
  const creditEntries: ActivityEntry[] = (input.creditOrders ?? [])
    .filter(o => o.status !== 'EXPIRED')
    .map(order => ({ kind: 'credit', id: `credit:${order.id}`, createdAt: order.createdAt, order }))
  // Stable tiebreak on id so entries sharing a timestamp keep a deterministic order across renders.
  return [...purchaseEntries, ...saleEntries, ...creditEntries].sort(
    (a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1)
  )
}

export function filterActivity(entries: ActivityEntry[], filter: ActivityFilter): ActivityEntry[] {
  if (filter === 'all') return entries
  // "Sales" is the seller side; "Purchases" is everything the user bought — item orders AND credit-pack
  // top-ups (a credit purchase is still a purchase).
  if (filter === 'sales') return entries.filter(e => e.kind === 'sale')
  return entries.filter(e => e.kind === 'purchase' || e.kind === 'credit')
}
