import type { PurchaseRecord } from '~/lib/credits'

// One order card = one checkout. A cart checkout authorizes ONE purchase intent per line (each with
// its own tradeId), so the credits-server returns N `PurchaseRecord`s for an N-item cart. This module
// folds those back into orders so the UI shows one card per checkout instead of N loose rows.
export type PurchaseOrder = {
  // Stable key for the order (the shared tx hash when present, else the earliest line id).
  id: string
  // Newest line's timestamp — what the card header shows and what orders are sorted by.
  createdAt: number
  /**
   * The order's state, by precedence over its lines: PENDING > SETTLED > EXPIRED.
   *
   * All three, deliberately. This used to be `'PENDING' | 'SETTLED'`, narrowed from the three a
   * PurchaseRecord actually has, and the missing one is the failure case — so every EXPIRED line was
   * folded into SETTLED here and rendered downstream as a completed purchase. The two-branch ternary that
   * did the rendering was correct code over a type that could not say otherwise.
   *
   * The precedence, and why that order: never say "failed" while any part is still in flight, and never
   * say "failed" when some part actually succeeded. A cart settles all-or-nothing in one transaction, so a
   * genuinely mixed order is close to impossible — but the TTL sweep and the reconciler act per row and
   * independently, so a transient mix is reachable and needs a deterministic answer rather than whichever
   * line happens to be first.
   */
  status: 'PENDING' | 'SETTLED' | 'EXPIRED'
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
    status: orderStatus(lines),
    totalCredits: lines.reduce((sum, l) => sum + l.credits, 0),
    lines
  }))
}

/** The order's state by precedence over its lines — see PurchaseOrder.status for why this order. */
function orderStatus(lines: PurchaseRecord[]): PurchaseOrder['status'] {
  if (lines.some(l => l.status === 'PENDING')) return 'PENDING'
  if (lines.some(l => l.status === 'SETTLED')) return 'SETTLED'
  return 'EXPIRED'
}

/**
 * An order's state as the Activity pill's own vocabulary, so the components never compare against a status
 * the server speaks. Mirrors `creditOrderPill` for credit-pack top-ups, and maps onto the same four pill
 * styles — a failed purchase gets the FAILED treatment a failed top-up already had, rather than a new one.
 */
export function purchaseOrderPill(status: PurchaseOrder['status']): 'SETTLED' | 'PENDING' | 'FAILED' {
  if (status === 'SETTLED') return 'SETTLED'
  // EXPIRED here always means a purchase that was submitted and did not go through — an intent nobody
  // submitted never reaches the feed (see lib/activity isWorthShowing). "Failed" is the honest word: it is
  // terminal, and the buyer got nothing.
  if (status === 'EXPIRED') return 'FAILED'
  return 'PENDING'
}

// One rendered row of an order: the same item bought N times in one cart is ONE line with a quantity
// and a summed price, rather than N identical rows. Resolution (name/thumbnail) is done once per row,
// from `tradeId` when there is one and from the item otherwise.
//
// A line is folded by whatever identifies WHAT it bought. A trade id does, and so does an item — which is
// what lets a CollectionStore mint bought ×3 collapse into one row too; it has no trade, so before the item
// was recorded those three arrived as three identical anonymous rows. A line with neither is unidentifiable
// and stays on its own row, keyed by its record id.
export type OrderLineItem = {
  key: string
  tradeId: string | null
  contractAddress: string | null
  itemId: string | null
  quantity: number
  credits: number
}

// The identity two lines must share to be the same row. Prefixed per kind so a trade id can never collide
// with an item key.
function foldKey(line: PurchaseRecord): string | null {
  if (line.tradeId) return `trade:${line.tradeId}`
  if (line.contractAddress && line.itemId) return `item:${line.contractAddress.toLowerCase()}:${line.itemId}`
  return null
}

export function foldOrderLines(lines: PurchaseRecord[]): OrderLineItem[] {
  const out: OrderLineItem[] = []
  const byKey = new Map<string, OrderLineItem>()
  for (const line of lines) {
    const key = foldKey(line)
    if (!key) {
      out.push({
        key: line.id,
        tradeId: null,
        contractAddress: line.contractAddress ?? null,
        itemId: line.itemId ?? null,
        quantity: 1,
        credits: line.credits
      })
      continue
    }
    const existing = byKey.get(key)
    if (existing) {
      existing.quantity += 1
      existing.credits += line.credits
      continue
    }
    const item: OrderLineItem = {
      key,
      tradeId: line.tradeId,
      contractAddress: line.contractAddress ?? null,
      itemId: line.itemId ?? null,
      quantity: 1,
      credits: line.credits
    }
    byKey.set(key, item)
    out.push(item)
  }
  return out
}
