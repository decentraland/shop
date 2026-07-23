import type { PurchaseRecord } from '~/lib/credits'
import type { SaleRecord } from '~/lib/api'
import { groupPurchases, type PurchaseOrder } from '~/lib/purchases'
import { manaWeiToCredits, type ManaRate } from '~/lib/mana-rate'

export type ActivityFilter = 'all' | 'purchases' | 'sales'

// A completed secondary sale, normalized for the feed. `credits` is the MANA settlement price
// converted to INDICATIVE credits at the current display rate (null when the rate is unavailable — the
// row then omits the amount rather than showing a fake value). Sales settle in MANA, so this figure is
// approximate, unlike a purchase's exact credit price.
export type ActivitySale = {
  id: string
  contractAddress: string
  tokenId: string
  itemId: string | null
  counterparty: string // the buyer's account
  credits: number | null
  createdAt: number
}

// One entry in the chronological Activity feed. A purchase keeps the existing per-checkout grouping
// (one entry per order, N line items inside); a sale is one entry.
export type ActivityEntry =
  | { kind: 'purchase'; id: string; createdAt: number; order: PurchaseOrder }
  | { kind: 'sale'; id: string; createdAt: number; sale: ActivitySale }

export function toActivitySale(sale: SaleRecord, rate?: ManaRate): ActivitySale {
  return {
    id: sale.id,
    contractAddress: sale.contractAddress,
    tokenId: sale.tokenId,
    itemId: sale.itemId,
    counterparty: sale.buyer,
    credits: rate ? manaWeiToCredits(sale.manaWei, rate) : null,
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
  // Stable tiebreak on id so entries sharing a timestamp keep a deterministic order across renders.
  return [...purchaseEntries, ...saleEntries].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1))
}

export function filterActivity(entries: ActivityEntry[], filter: ActivityFilter): ActivityEntry[] {
  if (filter === 'all') return entries
  const kind = filter === 'purchases' ? 'purchase' : 'sale'
  return entries.filter(e => e.kind === kind)
}
