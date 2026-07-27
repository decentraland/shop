import type { PurchaseRecord } from '~/lib/credits'

// One order card = one checkout. A cart checkout authorizes ONE purchase intent per line (each with
// its own tradeId), so the credits-server returns N `PurchaseRecord`s for an N-item cart. This module
// folds those back into orders so the UI shows one card per checkout instead of N loose rows.
export type PurchaseOrder = {
  // Stable key for the order (the shared tx hash when present, else the earliest line id).
  id: string
  // Newest line's timestamp — what the card header shows and what orders are sorted by.
  createdAt: number
  // COMPLETED unless any line is still settling, in which case the whole order reads as PROCESSING.
  status: 'PENDING' | 'SETTLED'
  totalCredits: number
  lines: PurchaseRecord[]
}

// Cart lines are authorized SEQUENTIALLY within one checkout (see pages/Cart.tsx) — each is a quick
// HTTP round-trip, so even a large cart's lines land within a few seconds of each other. When the
// server gives us no shared id, we treat lines within this window as one order. Kept tight so two
// genuinely separate checkouts (even a minute apart) never merge.
const GROUP_WINDOW_MS = 15_000

// Do two adjacent (time-sorted) lines belong to the same checkout?
//  - Both carry a settlement tx hash → authoritative: same order iff the hashes match (a cart settles
//    in ONE tx, so every line shares it). If one has a hash and the other doesn't, they can't be the
//    same settled order.
//  - Neither has a hash (older server, or still-pending intents) → fall back to timestamp proximity,
//    AND require the same status: a cart settles all-or-nothing in one tx, so its lines always share a
//    status. A SETTLED next to a PENDING is therefore two different orders, never one cart.
function sameOrder(a: PurchaseRecord, b: PurchaseRecord): boolean {
  if (a.txHash && b.txHash) return a.txHash === b.txHash
  if (a.txHash || b.txHash) return false
  return a.status === b.status && Math.abs(a.createdAt - b.createdAt) <= GROUP_WINDOW_MS
}

// Group purchase records into orders, newest order first (and newest line first within an order).
// Grouping is by adjacency on the time-sorted list, so a large cart whose lines span more than the
// window still coalesces as long as consecutive lines stay within it (chained).
export function groupPurchases(records: PurchaseRecord[]): PurchaseOrder[] {
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt)

  const groups: PurchaseRecord[][] = []
  for (const record of sorted) {
    const current = groups[groups.length - 1]
    if (current && sameOrder(current[current.length - 1], record)) current.push(record)
    else groups.push([record])
  }

  return groups.map(lines => ({
    id: lines.find(l => l.txHash)?.txHash ?? lines[lines.length - 1].id,
    createdAt: Math.max(...lines.map(l => l.createdAt)),
    status: lines.some(l => l.status === 'PENDING') ? 'PENDING' : 'SETTLED',
    totalCredits: lines.reduce((sum, l) => sum + l.credits, 0),
    lines
  }))
}

// One rendered row of an order: the same item bought N times in one cart is ONE line with a quantity
// and a summed price, rather than N identical rows. Lines without a tradeId can't be proven identical,
// so each stays on its own row (keyed by its record id). Resolution (name/thumbnail) is done once per
// row from `tradeId`.
export type OrderLineItem = {
  key: string
  tradeId: string | null
  quantity: number
  credits: number
}

export function foldOrderLines(lines: PurchaseRecord[]): OrderLineItem[] {
  const out: OrderLineItem[] = []
  const byTrade = new Map<string, OrderLineItem>()
  for (const line of lines) {
    if (line.tradeId) {
      const existing = byTrade.get(line.tradeId)
      if (existing) {
        existing.quantity += 1
        existing.credits += line.credits
        continue
      }
      const item: OrderLineItem = { key: line.tradeId, tradeId: line.tradeId, quantity: 1, credits: line.credits }
      byTrade.set(line.tradeId, item)
      out.push(item)
    } else {
      out.push({ key: line.id, tradeId: null, quantity: 1, credits: line.credits })
    }
  }
  return out
}
